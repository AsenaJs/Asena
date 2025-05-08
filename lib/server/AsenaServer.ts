import type { Class, StaticServeClass } from './types';
import type { Container } from '../ioc';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { ComponentType, type InjectableComponent } from '../ioc/types';
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
import { PrepareMiddlewareService } from './src/services/PrepareMiddlewareService';
import { PrepareConfigService } from './src/services/PrepareConfigService';
import { PrepareWebsocketService } from './src/services/PrepareWebsocketService';
import { PrepareValidatorService } from './src/services/PrepareValidatorService';
import { PrepareStaticServeConfigService } from './src/services/PrepareStaticServeConfigService';

export class AsenaServer<A extends AsenaAdapter<any, any>> {

  private _port: number;

  private controllers: Class[] = [];

  private _components: InjectableComponent[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  private readonly _adapter: A;

  private prepareMiddleware: PrepareMiddlewareService;

  private prepareConfigService: PrepareConfigService;

  private prepareWebsocketService: PrepareWebsocketService;

  private prepareValidatorService: PrepareValidatorService;

  private prepareStaticServeConfigService: PrepareStaticServeConfigService;

  public constructor(adapter: A, logger: ServerLogger) {
    this._adapter = adapter;

    this._logger = logger;

    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                            `);
  }

  public async initialize(): Promise<Container> {
    const config = await readConfigFile();

    if (!config) {
      this._logger.warn('asena-config file not found');
    }

    this._ioc = new IocEngine(config);

    await this._ioc.searchAndRegister(this._components);

    this.prepareMiddleware = new PrepareMiddlewareService(this._ioc.container, this._logger);

    this.prepareConfigService = new PrepareConfigService(this._ioc.container, this._logger);

    this.prepareWebsocketService = new PrepareWebsocketService(this._ioc.container, this._logger);

    this.prepareValidatorService = new PrepareValidatorService(this._ioc.container, this._logger);

    this.prepareStaticServeConfigService = new PrepareStaticServeConfigService(this._ioc.container, this._logger);

    return this._ioc.container;
  }

  public async start(gc = false): Promise<void> {
    await this.initialize();

    this._logger.info(`Adapter: ${green(this._adapter.name)} implemented`);

    this._adapter.setPort(this._port);

    this._logger.info('All components registered and ready to use');

    await this.prepareConfigs();

    await this.initializeControllers();

    await this.prepareWebSocket();

    this._logger.info('Server started on port ' + this._port);

    await this._adapter.start();

    // TODO: this is wierd but when we call gc asena uses less memory rest of the time
    if (gc) {
      bun.gc(true);
    }
  }

  public components(components: Class[]) {
    this._components = components.map((_component: Class) => {
      const face: string = getTypedMetadata<string>(ComponentConstants.InterfaceKey, _component);
      const component: InjectableComponent = {
        Class: _component as Class,
        interface: face,
      };

      return component;
    });

    return this;
  }

  public port(port: number) {
    this._port = port;

    return this;
  }

  public logger(value: ServerLogger) {
    this._logger = value;

    return this;
  }

  private async initializeControllers() {
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

  private async validateAndSetControllers() {
    const controllers = await this._ioc.container.resolveAll<Class>(ComponentType.CONTROLLER);

    if (controllers !== null) {
      // check if any controller is array or not
      if (controllers.find((controller) => Array.isArray(controller))) {
        throw new Error('Controller cannot be array');
      }

      this.controllers = controllers as Class[];
    }
  }

  private async prepareStaticServeConfig(staticServeClass: StaticServeClass): Promise<BaseStaticServeParams> {
    return await this.prepareStaticServeConfigService.prepare(staticServeClass);
  }

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

  private async prepareValidator(Validator: ValidatorClass<any>): Promise<BaseValidator> {
    return await this.prepareValidatorService.prepare(Validator);
  }

  private async prepareRouteMiddleware(middlewareParams: ApiParams): Promise<BaseMiddleware[]> {
    const routeMiddlewares = middlewareParams?.middlewares || [];

    return this.prepareMiddlewares(routeMiddlewares);
  }

  private async prepareMiddlewares(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    return this.prepareMiddleware.prepare(middlewares);
  }

  private async prepareWebSocket() {
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

  private async prepareConfigs() {
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
