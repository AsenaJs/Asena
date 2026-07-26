import type { Class, StaticServeClass } from './types';
import {
  ComponentType,
  CoreBootstrapPhase,
  type CoreContainer,
  CoreService,
  type ICoreService,
  ICoreServiceNames,
  type IocEngine,
} from '../ioc';
import type {
  ApiParams,
  AsenaAdapter,
  AsenaStartOptions,
  BaseMiddleware,
  BaseStaticServeParams,
  BaseValidator,
  PrepareMiddlewareParams,
  Route,
} from '../adapter';
import * as path from 'node:path';
import type { MiddlewareClass, ValidatorClass } from './web/middleware';
import { ComponentConstants } from '../ioc/constants';
import * as bun from 'bun';
import { blue, green, type ServerLogger, yellow } from '../logger';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils/typedMetadata';
import type { PrepareMiddlewareService } from './src/services/PrepareMiddlewareService';
import type { PrepareConfigService } from './src/services/PrepareConfigService';
import type { PrepareWebsocketService } from './src/services/PrepareWebsocketService';
import type { PrepareValidatorService } from './src/services/PrepareValidatorService';
import type { PrepareStaticServeConfigService } from './src/services/PrepareStaticServeConfigService';
import type { PrepareFrontendControllerService } from './src/services/PrepareFrontendControllerService';
import { Inject, PostConstruct } from '../ioc/component';
import type { GlobalMiddlewareConfig, GlobalMiddlewareEntry } from './config/AsenaConfig';
import { normalizeTransportConfig } from './config/AsenaConfig';
import type { Ulak } from './messaging/Ulak';
import type { HealthOptions } from './AsenaServerFactory';
import { HealthServer } from './health/HealthServer';
import type { PrepareEventService } from './src/services/PrepareEventService';
import type { PrepareScheduleService } from './src/services/PrepareScheduleService';
import type { PrepareMicroserviceService } from './src/services/PrepareMicroserviceService';
import type { CronRunner } from './schedule/CronRunner';
import type { MessagingInterceptor } from './microservice/types';
import type { MicroserviceTransport } from './microservice/MicroserviceTransport';

/**
 * @description AsenaServer - Main server class for Asena framework
 * Now a core service managed by IoC container with field injection
 */
@CoreService(ICoreServiceNames.ASENA_SERVER)
export class AsenaServer<A extends AsenaAdapter<any, any>> implements ICoreService {
  public serviceName = 'AsenaServer';

  @Inject(ICoreServiceNames.CORE_CONTAINER)
  private _coreContainer!: CoreContainer;

  // NOT injected eagerly: resolved lazily in start() via container.has()
  // so the server can boot in headless mode without an HTTP adapter
  private _adapter?: A;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private _logger!: ServerLogger;

  @Inject(ICoreServiceNames.IOC_ENGINE)
  private _iocEngine!: IocEngine;

  @Inject(ICoreServiceNames.__ULAK__)
  private _ulak!: Ulak;

  @Inject(ICoreServiceNames.PREPARE_MIDDLEWARE_SERVICE)
  private prepareMiddleware!: PrepareMiddlewareService;

  @Inject(ICoreServiceNames.PREPARE_CONFIG_SERVICE)
  private prepareConfigService!: PrepareConfigService;

  @Inject(ICoreServiceNames.PREPARE_WEBSOCKET_SERVICE)
  private prepareWebsocketService!: PrepareWebsocketService;

  @Inject(ICoreServiceNames.PREPARE_VALIDATOR_SERVICE)
  private prepareValidatorService!: PrepareValidatorService;

  @Inject(ICoreServiceNames.PREPARE_STATIC_SERVE_CONFIG_SERVICE)
  private prepareStaticServeConfigService!: PrepareStaticServeConfigService;

  @Inject(ICoreServiceNames.PREPARE_EVENT_SERVICE)
  private prepareEventService: PrepareEventService;

  @Inject(ICoreServiceNames.PREPARE_SCHEDULE_SERVICE)
  private prepareScheduleService: PrepareScheduleService;

  @Inject(ICoreServiceNames.PREPARE_FRONTEND_CONTROLLER_SERVICE)
  private prepareFrontendControllerService: PrepareFrontendControllerService;

  @Inject(ICoreServiceNames.PREPARE_MICROSERVICE_SERVICE)
  private prepareMicroserviceService: PrepareMicroserviceService;

  @Inject(ICoreServiceNames.CRON_RUNNER)
  private cronRunner: CronRunner;

  // Instance state
  private _port!: number;

  private _gc = false;

  private controllers: Class[] = [];

  // Microservice transports collected from the transport() config hook
  private microserviceTransports: Map<string, MicroserviceTransport> = new Map();

  private messagingInterceptors: MessagingInterceptor[] = [];

  // Optional health endpoint (mainly for headless deployments / K8s probes)
  private _health?: HealthOptions;

  private healthServer?: HealthServer;

  // The Bun server returned by the adapter - exposes the actually bound port, which is
  // what a caller needs when starting on port 0 or on a unix socket
  private _httpServer?: bun.Server<any>;

  /**
   * @description Lifecycle hook - called after dependencies are injected
   * @returns {void}
   */
  @PostConstruct()
  public onInit(): void {
    this._logger.info(`${blue('[AsenaServer]')} is initialized`);
  }

  /**
   * @description Start the server
   * Main entry point after factory creation
   * @param {AsenaStartOptions} options - Optional transport overrides forwarded to the adapter
   * @returns {Promise<void>}
   */
  public async start(options?: AsenaStartOptions): Promise<void> {
    await this.resolveAdapter();

    if (this._adapter) {
      this._logger.info(`Adapter: ${green(this._adapter.name)} implemented`);
      this._adapter.setPort(this._port);
    } else {
      this._logger.info('Headless mode: no HTTP adapter configured');
      this.warnAdapterlessComponents();
    }

    // Runs here rather than during the scan: statements between create() and start()
    // in the entry file have executed by now, so a component declared below the
    // bootstrap call is visible and can be reported instead of silently missing
    this._iocEngine.warnAboutLateEntryComponents();

    this._logger.info('All components registered and ready to use');

    // Phase 7: Application setup
    this._coreContainer.setPhase(CoreBootstrapPhase.APPLICATION_SETUP);
    await this.prepareConfigs();
    await this.prepareMicroservices();
    await this.prepareEventService.prepare();
    await this.prepareScheduleService.prepare();

    if (this._adapter) {
      await this.initializeControllers();
      await this.prepareFrontendControllers();
      await this.prepareWebSocket();
    }

    // Phase 8: Server ready
    this._coreContainer.setPhase(CoreBootstrapPhase.SERVER_READY);

    if (this._adapter) {
      this._httpServer = await this._adapter.start(options);
    }

    // Start scheduled jobs after server is ready
    this.cronRunner.startAll();

    if (this._health) {
      this.healthServer = new HealthServer(this._health, this._ulak, this._logger);
      this.healthServer.start();
    }

    if (this._gc) {
      bun.gc(true);
    }
  }

  /**
   * @description Stop the server and release resources
   * @param {boolean} closeActiveConnections - Whether to close active connections immediately
   * @returns {Promise<void>}
   */
  public async stop(closeActiveConnections = true): Promise<void> {
    this.cronRunner.stopAll();
    this.healthServer?.stop();
    // Adapter first: in-flight HTTP handlers may still call ulak.send(), so
    // transports must outlive the HTTP surface that uses them
    await this._adapter?.stop(closeActiveConnections);
    await this.prepareMicroserviceService.destroy();
  }

  /**
   * @description Configure server port
   * Builder pattern for API compatibility
   * @param {number} port - Port number
   * @returns {this}
   */
  public port(port: number): this {
    this._port = port;
    return this;
  }

  /**
   * @description Configure the optional health endpoint (mainly for headless/K8s probes)
   * Builder pattern for API compatibility
   * @param {HealthOptions} options - Health endpoint options
   * @returns {this}
   */
  public health(options: HealthOptions): this {
    this._health = options;
    return this;
  }

  /**
   * @description Lazily resolve the HTTP adapter if one was registered.
   * Headless mode (no adapter) is valid - all adapter-dependent steps are skipped.
   * @returns {Promise<void>}
   */
  private async resolveAdapter(): Promise<void> {
    if (this._adapter) {
      return;
    }

    if (this._coreContainer.container.has(ICoreServiceNames.ASENA_ADAPTER)) {
      this._adapter = await this._coreContainer.resolve<A>(ICoreServiceNames.ASENA_ADAPTER);
    }
  }

  /**
   * @description Warn about HTTP-only components that cannot work without an adapter
   * @returns {void}
   */
  private warnAdapterlessComponents(): void {
    const httpOnlyTypes = [ComponentType.CONTROLLER, ComponentType.WEBSOCKET, ComponentType.FRONTEND_CONTROLLER];

    const services = this._coreContainer.container.services;

    for (const type of httpOnlyTypes) {
      const names: string[] = [];

      for (const value of Object.values(services)) {
        const entries = Array.isArray(value) ? value : [value];

        for (const entry of entries) {
          if (entry?.Class && getTypedMetadata<boolean>(type, entry.Class)) {
            names.push(entry.Class.name);
          }
        }
      }

      if (names.length) {
        this._logger.warn(
          `Headless mode: ${type} component(s) [${names.join(', ')}] require an HTTP adapter and will be ignored`,
        );
      }
    }
  }

  /**
   * @description Get current CoreContainer instance
   * @returns {CoreContainer}
   */
  public get coreContainer(): CoreContainer {
    return this._coreContainer;
  }

  /**
   * @description The Bun server the adapter is listening on, once start() has run.
   *
   * Undefined in headless mode and before start(). Read `httpServer.port` to learn the
   * actually bound port - the only way to find it out when starting on port 0.
   * @returns {bun.Server | undefined}
   */
  public get httpServer(): bun.Server<any> | undefined {
    return this._httpServer;
  }

  /**
   * @description Initialize and register all controllers
   * @returns {Promise<void>}
   */
  private async initializeControllers(): Promise<void> {
    await this.validateAndSetControllers();

    const registeredRoutes = new Map<string, { controllerName: string; handlerName: string }>();

    for (const controller of this.controllers) {
      const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, controller.constructor) || {};

      const routePath: string = getOwnTypedMetadata<string>(ComponentConstants.PathKey, controller.constructor) || '';

      await this.prepareTopMiddlewares({ controller, routePath });

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(`${routePath}/`, params.path).replace(/\\/g, '/');
        const controllerName =
          getTypedMetadata<string>(ComponentConstants.NameKey, controller.constructor) || 'Unknown';

        this.checkDuplicateRoute(registeredRoutes, params.method, lastPath, controllerName, name);

        const middlewares = await this.prepareRouteMiddleware(params);
        const validatorInstance = await this.prepareValidator(params.validator);

        await this._adapter.registerRoute({
          method: params.method,
          path: lastPath,
          middlewares: middlewares,
          handler: controller[name].bind(controller),
          staticServe: await this.prepareStaticServeConfig(params.staticServe),
          validator: validatorInstance,
          controllerName,
          controllerBasePath: routePath,
        });
      }
    }
  }

  /**
   * @description Check for duplicate route registration and throw if found
   */
  private checkDuplicateRoute(
    registeredRoutes: Map<string, { controllerName: string; handlerName: string }>,
    method: string,
    fullPath: string,
    controllerName: string,
    handlerName: string,
  ): void {
    const routeKey = `${method.toUpperCase()} ${fullPath}`;

    // Check for exact duplicate (same method + path)
    const existing = registeredRoutes.get(routeKey);

    if (existing) {
      throw new Error(
        `Duplicate route detected: ${routeKey} — ` +
          `already registered by ${existing.controllerName}.${existing.handlerName}(), ` +
          `conflicts with ${controllerName}.${handlerName}()`,
      );
    }

    // Check ALL conflicts: if new route is ALL, check if any method already registered for this path
    if (method.toUpperCase() === 'ALL') {
      for (const [key, entry] of registeredRoutes) {
        if (key.endsWith(` ${fullPath}`)) {
          throw new Error(
            `Duplicate route detected: ALL ${fullPath} conflicts with ${key} — ` +
              `already registered by ${entry.controllerName}.${entry.handlerName}(), ` +
              `conflicts with ${controllerName}.${handlerName}()`,
          );
        }
      }
    }

    // Check if ALL already registered for this path and new route conflicts
    const allKey = `ALL ${fullPath}`;
    const allEntry = registeredRoutes.get(allKey);

    if (allEntry && method.toUpperCase() !== 'ALL') {
      throw new Error(
        `Duplicate route detected: ${routeKey} conflicts with ALL ${fullPath} — ` +
          `already registered by ${allEntry.controllerName}.${allEntry.handlerName}(), ` +
          `conflicts with ${controllerName}.${handlerName}()`,
      );
    }

    registeredRoutes.set(routeKey, { controllerName, handlerName });
  }

  /**
   * @description Validate and set controllers from container
   * @returns {Promise<void>}
   */
  private async validateAndSetControllers(): Promise<void> {
    const controllers = await this._coreContainer.container.resolveAll<Class>(ComponentType.CONTROLLER);

    if (controllers !== null) {
      // check if any controller is array or not
      if (controllers.find((controller) => Array.isArray(controller))) {
        throw new Error('Controller cannot be array');
      }

      this.controllers = controllers as Class[];
    }
  }

  /**
   * @description Prepare static serve configuration
   * @param {StaticServeClass} staticServeClass - Static serve class
   * @returns {Promise<BaseStaticServeParams>}
   */
  private async prepareStaticServeConfig(staticServeClass: StaticServeClass): Promise<BaseStaticServeParams> {
    return await this.prepareStaticServeConfigService.prepare(staticServeClass);
  }

  /**
   * @description Prepare top-level middlewares for controller or websocket
   * @param {PrepareMiddlewareParams} params - Middleware parameters
   * @param {boolean} websocket - Whether this is for websocket
   * @returns {Promise<BaseMiddleware[]>}
   */
  private async prepareTopMiddlewares(
    { controller, routePath }: PrepareMiddlewareParams,
    websocket = false,
  ): Promise<BaseMiddleware[]> {
    const topMiddlewares =
      getTypedMetadata<MiddlewareClass[]>(ComponentConstants.MiddlewaresKey, controller.constructor) || [];

    const middlewares = await this.prepareMiddlewares(topMiddlewares);

    if (websocket) {
      return middlewares;
    }

    // Register controller-level middlewares with pattern matching
    // Convert routePath to pattern: /api → /api/*
    const routePattern = routePath ? `${routePath}/*` : undefined;

    for (const middleware of middlewares) {
      await this._adapter.use(middleware, routePattern ? { include: [routePattern] } : undefined);
    }
  }

  /**
   * @description Prepare validator instance
   * @param {ValidatorClass<any>} Validator - Validator class
   * @returns {Promise<BaseValidator>}
   */
  private async prepareValidator(Validator: ValidatorClass<any>): Promise<BaseValidator> {
    return await this.prepareValidatorService.prepare(Validator);
  }

  /**
   * @description Prepare route-level middlewares
   * @param {ApiParams} middlewareParams - Middleware parameters
   * @returns {Promise<BaseMiddleware[]>}
   */
  private async prepareRouteMiddleware(middlewareParams: ApiParams): Promise<BaseMiddleware[]> {
    const routeMiddlewares = middlewareParams?.middlewares || [];

    return this.prepareMiddlewares(routeMiddlewares);
  }

  /**
   * @description Prepare middlewares from classes
   * @param {MiddlewareClass[]} middlewares - Middleware classes
   * @returns {Promise<BaseMiddleware[]>}
   */
  private async prepareMiddlewares(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    return this.prepareMiddleware.prepare(middlewares);
  }

  /**
   * @description Prepare and register FrontendController HTML routes
   * @returns {Promise<void>}
   */
  private async prepareFrontendControllers(): Promise<void> {
    const htmlRoutes = await this.prepareFrontendControllerService.prepare();

    if (!htmlRoutes.length) {
      return;
    }

    for (const route of htmlRoutes) {
      this._adapter.registerHTMLRoute(route.path, route.htmlBundle, route.controllerName, route.controllerBasePath);
    }
  }

  /**
   * @description Prepare and register WebSocket routes
   * @returns {Promise<void>}
   */
  private async prepareWebSocket(): Promise<void> {
    const websockets = await this.prepareWebsocketService.prepare();

    if (!websockets) {
      return;
    }

    for (const websocket of websockets) {
      const path = getTypedMetadata<string>(ComponentConstants.PathKey, websocket.constructor);
      const middlewares = await this.prepareTopMiddlewares({ controller: websocket as unknown as Class }, true);

      await this._adapter.registerWebsocketRoute({
        path: path,
        middlewares: middlewares,
        websocketService: websocket,
        controllerName: getTypedMetadata<string>(ComponentConstants.NameKey, websocket.constructor),
      });
    }
  }

  /**
   * @description Normalizes global middleware entry to config format
   * Handles backward compatibility (MiddlewareClass → GlobalMiddlewareConfig)
   *
   * @param entry - Middleware entry (class or config object)
   * @returns Normalized config object
   */
  private normalizeMiddlewareEntry(entry: GlobalMiddlewareEntry): GlobalMiddlewareConfig {
    // If it's already a config object, return as-is
    if (typeof entry === 'object' && 'middleware' in entry) {
      return entry;
    }

    // If it's a class (old format), convert to config format
    return {
      middleware: entry,
      routes: undefined, // No route config = apply to all routes
    };
  }

  /**
   * @description Prepare and apply configuration
   * Updated to support pattern-based global middlewares
   * @returns {Promise<void>}
   */
  private async prepareConfigs(): Promise<void> {
    const configInstance = await this.prepareConfigService.prepare();

    if (!configInstance) {
      return;
    }

    if (typeof configInstance.serveOptions === 'function') {
      if (this._adapter) {
        await this._adapter.serveOptions(configInstance.serveOptions.bind(configInstance));
      } else {
        this._logger.warn('Headless mode: serveOptions() ignored (no HTTP adapter)');
      }
    }

    if (typeof configInstance.onError === 'function') {
      if (this._adapter) {
        await this._adapter.onError(configInstance.onError.bind(configInstance));
      } else {
        this._logger.warn('Headless mode: onError() ignored (no HTTP adapter)');
      }
    }

    // Pattern-based global middleware registration
    if (typeof configInstance.globalMiddlewares === 'function') {
      if (this._adapter) {
        const middlewareEntries = await configInstance.globalMiddlewares();

        for (const entry of middlewareEntries) {
          // Normalize entry to config format (handles backward compatibility)
          const config = this.normalizeMiddlewareEntry(entry);

          // Prepare middleware instances
          const preparedMiddlewares = await this.prepareMiddlewares([config.middleware]);

          // Register with adapter (pass route config)
          for (const middleware of preparedMiddlewares) {
            await this._adapter.use(middleware, config.routes);
          }
        }
      } else {
        this._logger.warn('Headless mode: globalMiddlewares() ignored (no HTTP adapter)');
      }
    }

    // Transport configuration (WebSocket + microservice)
    if (typeof configInstance.transport === 'function') {
      const result = await configInstance.transport();
      const normalized = await normalizeTransportConfig(result);

      if (normalized.websocket) {
        if (this._adapter) {
          const wsAdapter = this._adapter.getWebsocketAdapter();

          if (wsAdapter) {
            wsAdapter.transport = normalized.websocket;
          }
        } else {
          this._logger.warn('Headless mode: websocket transport ignored (no HTTP adapter)');
        }
      }

      // Microservice part works in BOTH modes - consumed by prepareMicroservices()
      this.microserviceTransports = normalized.microservices;
      this.messagingInterceptors = normalized.interceptors;
    }

    const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, configInstance.constructor);

    this._logger.info(`Config ${yellow(name)} applied`);
  }

  /**
   * @description Prepare microservice message handlers and transports
   * Runs before the HTTP adapter starts so handlers are live before HTTP goes up.
   * Also validates that @MessageController components have a configured transport (fail fast).
   * @returns {Promise<void>}
   */
  private async prepareMicroservices(): Promise<void> {
    await this.prepareMicroserviceService.prepare(this.microserviceTransports, this.messagingInterceptors);
  }
}
