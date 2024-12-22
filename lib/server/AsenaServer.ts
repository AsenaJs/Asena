import type { Class, MiddlewareClass, ValidatorClass } from './types';
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
} from './web/types';
import * as path from 'node:path';
import type { AsenaMiddlewareService, AsenaValidationService } from './web/middleware';
import type { AsenaAdapter, AsenaWebsocketAdapter } from '../adapter';
import type { AsenaWebSocketService, WebSocketData, WSOptions } from './web/websocket';
import { ComponentConstants } from '../ioc/constants';
import * as bun from 'bun';
import { green, type ServerLogger, yellow } from '../logger';
import { type AsenaConfig, AsenaConfigFuncions } from './config/AsenaConfig';
import { getTypedMetadata } from '../utils/typedMetadata';

export class AsenaServer<A extends AsenaAdapter<any, any, any, any, AsenaWebsocketAdapter<any, any, any>>> {

  private _port: number;

  private controllers: Class[] = [];

  private _components: InjectableComponent[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  private _adapter: A;

  private _wsOptions: WSOptions;

  public constructor(adapter: A, logger?: ServerLogger) {
    this._logger = logger;

    if (!logger) {
      this.prepareLogger();
    }

    const config = readConfigFile();

    if (!config) {
      this._logger.warn('Config file not found');
    }

    this._ioc = new IocEngine(config);

    if (adapter) {
      this._adapter = adapter;
    }
  }

  public async start(gc = false): Promise<void> {
    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                            `);

    this._logger.info(`Adapter: ${green(this._adapter.name)} implemented`);

    this._adapter.setPort(this._port);

    await this._ioc.searchAndRegister(this._components);

    this._logger.info('All components registered and ready to use');

    await this.prepareConfigs();

    await this.initializeControllers();

    await this.prepareWebSocket();

    this._logger.info('Server started on port ' + this._port);

    await this._adapter.start(this._wsOptions);

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

  public wsOptions(options: WSOptions) {
    this._wsOptions = options;

    return this;
  }

  private async initializeControllers() {
    await this.validateAndSetControllers();

    for (const controller of this.controllers) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, controller.constructor);

      this._logger.info(`Controller: ${green(name)} found:`);

      const routes = getTypedMetadata<Route>(ComponentConstants.RouteKey, controller) || {};

      const routePath: string = getTypedMetadata<string>(ComponentConstants.PathKey, controller.constructor) || '';

      await this.prepareTopMiddlewares({ controller, routePath });

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(`${routePath}/`, params.path);

        const middlewares = await this.prepareMiddleware(params);
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
  ): Promise<BaseMiddleware<any, any>[]> {
    const topMiddlewares =
      getTypedMetadata<MiddlewareClass[]>(ComponentConstants.MiddlewaresKey, controller.constructor) || [];
    const middlewares: BaseMiddleware<any, any>[] = [];

    for (const middleware of topMiddlewares) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, middleware);
      const instances = await this._ioc.container.resolve<AsenaMiddlewareService<any, any>>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];

      for (const instance of normalizedInstances) {
        const override = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, instance);
        const isOverride = override ? override.includes('handle') : false;
        const middleware: BaseMiddleware<any, any> = {
          handle: instance.handle.bind(instance),
          override: isOverride,
        };

        if (websocket) {
          middlewares.push(middleware);
        } else {
          await this._adapter.use(middleware, routePath);
        }
      }
    }

    return websocket ? middlewares : [];
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

  private async prepareMiddleware(middlewareParams: ApiParams): Promise<BaseMiddleware<any, any>[]> {
    const middlewares: BaseMiddleware<any, any>[] = [];
    const routeMiddlewares = middlewareParams?.middlewares || [];

    for (const middleware of routeMiddlewares) {
      const name: string = getTypedMetadata<string>(ComponentConstants.NameKey, middleware);
      const override: string[] | undefined = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, middleware);
      const isOverride = override ? override.includes('handle') : false;

      const instances: AsenaMiddlewareService<any, any> | AsenaMiddlewareService<any, any>[] =
        await this._ioc.container.resolve<AsenaMiddlewareService<any, any>>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];

      for (const instance of normalizedInstances) {
        middlewares.push({
          handle: instance.handle.bind(instance),
          override: isOverride,
        });
      }
    }

    return middlewares;
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

    for (const [key] of Object.keys(configInstance)) {
      if (typeof configInstance[key] === 'function' && AsenaConfigFuncions.includes(key)) {
        // bind every function to the instance
        await this._adapter[key](configInstance[key].bind(configInstance));
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
