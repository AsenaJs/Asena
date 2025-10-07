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
 * @description Configuration options for AsenaServer creation
 */
export interface AsenaServerOptions<A extends AsenaAdapter<any, any>> {
  adapter: A;
  logger: ServerLogger;
  port?: number;
  components?: Class[];
  gc?: boolean;
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
  public static async create<A extends AsenaAdapter<any, any>>(
    options: AsenaServerOptions<A>,
  ): Promise<AsenaServer<A>> {
    const { adapter, logger, port, components, gc } = options;

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
    if (port) server.port(port);

    if (gc !== undefined) (server as any)._gc = gc;

    return server;
  }

}
