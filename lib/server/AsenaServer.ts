import type { Class } from './types';
import type { Container } from '../ioc';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { ComponentType, type InjectableComponent } from '../ioc/types';
import {
  type ApiParams,
  type BaseMiddleware,
  type BaseValidator,
  type PrepareMiddlewareParams,
  type Route,
  VALIDATOR_METHODS,
  type ValidatorHandler,
} from '../adapter';
import * as path from 'node:path';
import type { AsenaMiddlewareService, AsenaValidationService, MiddlewareClass, ValidatorClass } from './web/middleware';
import type { AsenaAdapter, AsenaWebsocketAdapter } from '../adapter';
import type { AsenaWebSocketService, WebSocketData } from './web/websocket';
import { ComponentConstants } from '../ioc/constants';
import * as bun from 'bun';
import { green, type ServerLogger, yellow } from '../logger';
import type { AsenaConfig } from './config';
import {getOwnTypedMetadata, getTypedMetadata} from '../utils/typedMetadata';

export class AsenaServer<A extends AsenaAdapter<any, any, any, AsenaWebsocketAdapter<any, any>>> {

  private _port: number;

  private controllers: Class[] = [];

  private _components: InjectableComponent[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  private readonly _adapter: A;

  public constructor(adapter: A, logger?: ServerLogger) {
    this._logger = logger;

    if (!logger) {
      this.prepareLogger();
    }

    if (adapter) {
      this._adapter = adapter;
    }
  }

  public async initialize(): Promise<Container> {
    const config = await readConfigFile();

    if (!config) {
      this._logger.warn('Config file not found');
    }

    this._ioc = new IocEngine(config);

    await this._ioc.searchAndRegister(this._components);

    return this._ioc.container;
  }

  public async start(gc = false): Promise<void> {
    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                            `);

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
          middleware: middlewares,
          handler: controller[name].bind(controller),
          staticServe: params.staticServe,
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
    if (!Validator) {
      return;
    }

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, Validator);

    const validator = await this._ioc.container.resolve<AsenaValidationService<any>>(name);

    if (!validator) {
      throw new Error('Validator not found:' + name);
    }

    if (Array.isArray(validator)) {
      throw new Error('Validator cannot be array');
    }

    const overrides: string[] = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, validator.constructor);

    const baseValidatorMiddleware: BaseValidator = {};

    VALIDATOR_METHODS.filter((key) => typeof validator[key] === 'function').forEach((key) => {
      baseValidatorMiddleware[key] = {
        handle: validator[key].bind(validator),
        override: overrides?.includes(key) || false,
      } satisfies ValidatorHandler;
    });

    return baseValidatorMiddleware;
  }

  private async prepareRouteMiddleware(middlewareParams: ApiParams): Promise<BaseMiddleware[]> {
    const routeMiddlewares = middlewareParams?.middlewares || [];

    return this.prepareMiddlewares(routeMiddlewares);
  }

  private async prepareMiddlewares(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    const preparedMiddlewares: BaseMiddleware[] = [];

    for (const middleware of middlewares) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, middleware);
      const override = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, middleware);
      const isOverride = override ? override.includes('handle') : false;

      const instances = await this._ioc.container.resolve<AsenaMiddlewareService>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];

      for (const instance of normalizedInstances) {
        preparedMiddlewares.push({
          handle: instance.handle.bind(instance),
          override: isOverride,
        });
      }
    }

    return preparedMiddlewares;
  }

  private async prepareWebSocket() {
    const webSockets = await this._ioc.container.resolveAll<AsenaWebSocketService<WebSocketData>>(
      ComponentType.WEBSOCKET,
    );

    if (!webSockets?.length) {
      this._logger.info('No websockets found');
      return;
    }

    // flat the array
    const flatWebSockets = webSockets.flat();
    const registeredPaths = new Set<string>();

    for (const webSocket of flatWebSockets) {
      const path = getTypedMetadata<string>(ComponentConstants.PathKey, webSocket.constructor);

      if (!path) {
        throw new Error('Path not found in WebSocket');
      }

      if (registeredPaths.has(path)) {
        throw new Error(`Duplicate WebSocket path found: ${path}`);
      }

      registeredPaths.add(path);
      webSocket.namespace = path;

      const middlewares = await this.prepareTopMiddlewares({ controller: webSocket as unknown as Class }, true);

      await this._adapter.websocketAdapter.registerWebSocket(webSocket, middlewares);
    }
  }

  private async prepareConfigs() {
    const config = await this._ioc.container.resolveAll<AsenaConfig>(ComponentType.CONFIG);

    if (!config?.length) {
      this._logger.info('No configs found');
      return;
    }

    if (config.length > 1) {
      throw new Error('Only one config is allowed');
    }

    if (Array.isArray(config[0])) {
      throw new Error('Config cannot be array');
    }

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, config[0].constructor);

    this._logger.info(`Config found ${yellow(name)}`);

    const configInstance = config[0];

    if (!configInstance) {
      this._logger.info('Config instance not found');
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

    this._logger.info(`Config ${yellow(name)} applied`);
  }

  private prepareLogger() {
    if (!this._logger) {
      this._logger = console;
    }
  }

}
