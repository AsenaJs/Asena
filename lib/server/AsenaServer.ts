import type { Class, StaticServeClass } from './types';
import {
  ComponentType,
  CoreBootstrapPhase,
  type CoreContainer,
  CoreService,
  type ICoreService,
  ICoreServiceNames,
} from '../ioc';
import type {
  ApiParams,
  AsenaAdapter,
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
import { green, type ServerLogger, yellow } from '../logger';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils/typedMetadata';
import type { PrepareMiddlewareService } from './src/services/PrepareMiddlewareService';
import type { PrepareConfigService } from './src/services/PrepareConfigService';
import type { PrepareWebsocketService } from './src/services/PrepareWebsocketService';
import type { PrepareValidatorService } from './src/services/PrepareValidatorService';
import type { PrepareStaticServeConfigService } from './src/services/PrepareStaticServeConfigService';
import { Inject } from '../ioc/component';

/**
 * @description AsenaServer - Main server class for Asena framework
 * Now a core service managed by IoC container with field injection
 */
@CoreService(ICoreServiceNames.ASENA_SERVER)
export class AsenaServer<A extends AsenaAdapter<any, any>> implements ICoreService {

  public serviceName = 'AsenaServer';

  @Inject(ICoreServiceNames.CORE_CONTAINER)
  private _coreContainer!: CoreContainer;

  @Inject(ICoreServiceNames.ASENA_ADAPTER)
  private _adapter!: A;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private _logger!: ServerLogger;

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

  // Instance state
  private _port!: number;

  private _gc = false;

  private controllers: Class[] = [];

  /**
   * @description Lifecycle hook - called after dependencies are injected
   * @returns {void}
   */
  public onInit(): void {
    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
    `);
  }

  /**
   * @description Start the server
   * Main entry point after factory creation
   * @returns {Promise<void>}
   */
  public async start(): Promise<void> {
    this._logger.info(`Adapter: ${green(this._adapter.name)} implemented`);
    this._adapter.setPort(this._port);
    this._logger.info('All components registered and ready to use');

    // Phase 7: Application setup
    this._coreContainer.setPhase(CoreBootstrapPhase.APPLICATION_SETUP);
    await this.prepareConfigs();
    await this.initializeControllers();
    await this.prepareWebSocket();

    // Phase 8: Server ready
    this._coreContainer.setPhase(CoreBootstrapPhase.SERVER_READY);
    this._logger.info('Server started on port ' + this._port);

    await this._adapter.start();

    if (this._gc) {
      bun.gc(true);
    }
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
   * @description Get current CoreContainer instance
   * @returns {CoreContainer}
   */
  public get coreContainer(): CoreContainer {
    return this._coreContainer;
  }

  /**
   * @description Initialize and register all controllers
   * @returns {Promise<void>}
   */
  private async initializeControllers(): Promise<void> {
    await this.validateAndSetControllers();

    for (const controller of this.controllers) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, controller.constructor);

      this._logger.info(`Controller: ${green(name)} found:`);

      const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, controller.constructor) || {};

      const routePath: string = getOwnTypedMetadata<string>(ComponentConstants.PathKey, controller.constructor) || '';

      await this.prepareTopMiddlewares({ controller, routePath });

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(`${routePath}/`, params.path);

        const middlewares = await this.prepareRouteMiddleware(params);
        const validatorInstance = await this.prepareValidator(params.validator);

        await this._adapter.registerRoute({
          method: params.method,
          path: lastPath,
          middlewares: middlewares,
          handler: controller[name].bind(controller),
          staticServe: await this.prepareStaticServeConfig(params.staticServe),
          validator: validatorInstance,
        });
      }

      this._logger.info(`Controller: ${green(name)} successfully registered.`);
    }
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

    for (const middleware of middlewares) {
      await this._adapter.use(middleware, routePath);
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
      });
    }
  }

  /**
   * @description Prepare and apply configuration
   * @returns {Promise<void>}
   */
  private async prepareConfigs(): Promise<void> {
    const configInstance = await this.prepareConfigService.prepare();

    if (!configInstance) {
      return;
    }

    if (typeof configInstance.serveOptions === 'function') {
      await this._adapter.serveOptions(configInstance.serveOptions.bind(configInstance));
    }

    if (typeof configInstance.onError === 'function') {
      await this._adapter.onError(configInstance.onError.bind(configInstance));
    }

    if (typeof configInstance.globalMiddlewares === 'function') {
      const middlewares = await configInstance.globalMiddlewares();

      const preparedMiddlewares = await this.prepareMiddlewares(middlewares);

      for (const middleware of preparedMiddlewares) {
        await this._adapter.use(middleware);
      }
    }

    const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, configInstance.constructor);

    this._logger.info(`Config ${yellow(name)} applied`);
  }

}
