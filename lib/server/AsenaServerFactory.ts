import type { InjectableComponent, IocEngine } from '../ioc';
import { CoreBootstrapPhase, CoreContainer, ICoreServiceNames } from '../ioc';
import type { AsenaServer } from './AsenaServer';
import type { AsenaAdapter } from '../adapter';
import type { ServerLogger } from '../logger';
import type { Class } from './types';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { ComponentConstants } from '../ioc/constants';
import { getTypedMetadata } from '../utils/typedMetadata';

/**
 * @description Health endpoint options for headless/hybrid deployments
 */
export interface HealthOptions {
  /**
   * Port for the health endpoint mini server
   */
  port: number;

  /**
   * Endpoint path
   * @default '/healthz'
   */
  path?: string;
}

/**
 * @description Configuration options for AsenaServer creation
 *
 * `adapter` is required unless `headless: true` is set. HEADLESS mode opens
 * no HTTP server, but microservice transports, events, schedules and configs
 * still run - useful for internal services driven purely by microservice
 * messages.
 */
export interface AsenaServerOptions<A extends AsenaAdapter<any, any> = AsenaAdapter<any, any>> {
  adapter?: A;

  /**
   * Explicit opt-in for booting without an HTTP adapter. Required when
   * `adapter` is omitted, so a wiring bug that yields an undefined adapter
   * fails fast instead of silently starting an HTTP-less application.
   */
  headless?: boolean;

  logger: ServerLogger;
  port?: number;
  components?: Class[];
  gc?: boolean;
  health?: HealthOptions;

  /**
   * Replace registered components with pre-created test doubles, keyed by service name
   * (Spring's `@MockBean`).
   *
   * Seeded before user components are registered, so the real class is never constructed
   * and every dependent captures the double. Core services cannot be overridden - they
   * have already resolved their dependencies during bootstrap phases 1-5.
   */
  overrides?: Record<string, object>;
}

/**
 * @description Factory for creating AsenaServer instances
 * Handles IoC bootstrap and dependency injection
 */
export class AsenaServerFactory {
  /**
   * @description Create and configure AsenaServer instance
   * @param {AsenaServerOptions<A>} options - Server configuration options
   * @returns {Promise<AsenaServer<A>>} Fully configured AsenaServer instance
   */
  public static async create<A extends AsenaAdapter<any, any> = AsenaAdapter<any, any>>(
    options: AsenaServerOptions<A>,
  ): Promise<AsenaServer<A>> {
    const { adapter, logger, port, components, gc, health, overrides } = options;

    if (!adapter && !options.headless) {
      throw new Error(
        "AsenaServerFactory.create: no 'adapter' provided - pass an HTTP adapter, " +
          "or set 'headless: true' to intentionally start without one",
      );
    }

    logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
------------------------------------------------------------
    `);

    // Read config file
    const config = await readConfigFile();

    if (!config) {
      logger.warn('asena-config file not found');
    }

    // Create CoreContainer
    const coreContainer = new CoreContainer();

    // Phase 1-5: Bootstrap core services
    await coreContainer.bootstrap(adapter, logger);

    // Register CoreContainer itself for AsenaServer injection
    await coreContainer.container.registerInstance(ICoreServiceNames.CORE_CONTAINER, coreContainer);

    // Phase 6: Register user components
    const iocEngine = await coreContainer.resolve<IocEngine>(ICoreServiceNames.IOC_ENGINE);

    iocEngine.setConfig(config);

    // Seed overrides before any user component is registered: Container builds injection
    // closures eagerly, so a double added later would be missed by existing dependents
    if (overrides) {
      const coreServiceNames = new Set<string>(Object.values(ICoreServiceNames));

      for (const [name, instance] of Object.entries(overrides)) {
        if (coreServiceNames.has(name)) {
          throw new Error(
            `Cannot override core service '${name}' - core services are wired during bootstrap ` +
              'phases 1-5 and have already captured their dependencies by this point.',
          );
        }

        coreContainer.container.overrideInstance(name, instance);
      }
    }

    if (components?.length) {
      const injectableComponents: InjectableComponent[] = components.map((comp) => {
        const face: string = getTypedMetadata<string>(ComponentConstants.InterfaceKey, comp);

        return {
          Class: comp,
          interface: face,
        };
      });

      await iocEngine.searchAndRegister(injectableComponents);
    } else if (config) {
      await iocEngine.searchAndRegister();
    }

    coreContainer.setPhase(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    // Register AsenaServer as core service
    const { AsenaServer } = await import('./AsenaServer');

    await coreContainer.container.register(ICoreServiceNames.ASENA_SERVER, AsenaServer, true);

    // Resolve AsenaServer (with all dependencies injected)
    const server = await coreContainer.resolve<AsenaServer<A>>(ICoreServiceNames.ASENA_SERVER);

    // Configure server
    // Explicit !== undefined: port 0 is meaningful (let Bun pick a free ephemeral port)
    if (port !== undefined) server.port(port);

    if (health) server.health(health);

    if (gc !== undefined) (server as any)._gc = gc;

    return server;
  }
}
