import type { Class } from './types';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { type Component, ComponentType } from '../ioc/types';
import { getMetadata } from 'reflect-metadata/no-conflict';
import type { ApiHandler, BaseMiddleware, PrepareMiddlewareParams, Route } from './web/types';
import * as path from 'node:path';
import type { AsenaMiddlewareService } from './web/middleware';
import type { AsenaAdapter, AsenaContext } from '../adapter';
import type { AsenaWebSocketService, WebSocketData, WSOptions } from './web/websocket';
import type { AsenaWebsocketAdapter } from '../adapter/AsenaWebsocketAdapter';
import { ComponentConstants } from '../ioc/constants';
import * as bun from 'bun';
import { HonoAdapter } from '../adapter/hono';
import { HonoWebsocketAdapter } from '../adapter/hono/HonoWebsocketAdapter';
import { green, type ServerLogger } from '../logger';

export class AsenaServer {

  private _port: number;

  private controllers: Class[] = [];

  private _components: Component[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  private _adapter: AsenaAdapter<any, any, any, any, any, any, AsenaWebsocketAdapter<any, any>>;

  private _wsOptions: WSOptions;

  public constructor(adapter?: AsenaAdapter<any, any, any, any, any>) {
    this.prepareLogger();

    const config = readConfigFile();

    if (!config) {
      this._logger.error('Config file not found');
    }

    this._ioc = new IocEngine(config);

    if (adapter) {
      this._adapter = adapter;
    }
  }

  public async start(gc = false): Promise<void> {
    // Setting default adapter if not provided
    if (!this._adapter) {
      this._adapter = new HonoAdapter(new HonoWebsocketAdapter(), this._logger);
    }

    this._adapter.setPort(this._port);

    await this._ioc.searchAndRegister(this._components);

    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                            `);

    this._logger.info('IoC initialized');

    await this.initializeControllers();

    await this.prepareWebSocket();

    this.configureErrorHandling();

    this._logger.info('Server started on port ' + this._port);

    await this._adapter.start();

    // TODO: this is wierd but when we call gc asena uses less memory rest of the time
    if (gc) {
      bun.gc(true);
    }
  }

  public components(components: Class[]): AsenaServer {
    this._components = components.map((_component: Class) => {
      const face: string = getMetadata(ComponentConstants.InterfaceKey, _component);
      const component: Component = {
        Class: _component as Class,
        interface: face,
      };

      return component;
    });

    return this;
  }

  public port(port: number): AsenaServer {
    this._port = port;

    return this;
  }

  public logger(value: ServerLogger): AsenaServer {
    this._logger = value;

    return this;
  }

  public wsOptions(options: WSOptions): AsenaServer {
    this._wsOptions = options;

    return this;
  }

  private async initializeControllers() {
    const controllers = await this._ioc.container.resolveAll<Class>(ComponentType.CONTROLLER);

    if (controllers !== null) {
      // check if any controller is array or not
      if (controllers.find((controller) => Array.isArray(controller))) {
        throw new Error('Controller cannot be array');
      }

      this.controllers = controllers as Class[];

      for (const controller of this.controllers) {
        this._logger.info(`Controller: ${green(controller.constructor.name)} found`);
      }
    }

    for (const controller of this.controllers) {
      const routes: Route = getMetadata(ComponentConstants.RouteKey, controller) || {};

      const routePath: string = getMetadata(ComponentConstants.PathKey, controller.constructor) || '';

      await this.prepareTopMiddlewares({ controller, routePath });

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(`${routePath}/`, params.path);

        const middlewares = this.prepareMiddleware(params);

        this._adapter.registerRoute({
          method: params.method,
          path: lastPath,
          middleware: this._adapter.prepareMiddlewares(middlewares),
          handler: this._adapter.prepareHandler(() => (ctx: AsenaContext<any, any>) => controller[name](ctx)),
          staticServe: params.staticServe,
          validator: this._adapter.prepareValidator(params.validator),
        });
      }
    }
  }

  private async prepareTopMiddlewares(
    { controller, routePath }: PrepareMiddlewareParams,
    websocket = false,
  ): Promise<BaseMiddleware<any, any>[]> {
    const topMiddlewares = getMetadata(ComponentConstants.MiddlewaresKey, controller.constructor) || [];
    const middlewareInstances: BaseMiddleware<any, any>[] = [];

    for (const middleware of topMiddlewares) {
      const name = getMetadata(ComponentConstants.NameKey, middleware);
      const instances = await this._ioc.container.resolve<AsenaMiddlewareService<any, any>>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];

      for (const instance of normalizedInstances) {
        const override = getMetadata(ComponentConstants.OverrideKey, instance);
        const middlewareConfig = { middlewareService: instance, override };

        if (websocket) {
          middlewareInstances.push(middlewareConfig);
        } else {
          this._adapter.use(middlewareConfig, routePath);
        }
      }
    }

    return websocket ? middlewareInstances : [];
  }

  private prepareMiddleware(middlewareParams: ApiHandler): BaseMiddleware<any, any>[] {
    const middlewares: BaseMiddleware<any, any>[] = [];
    const routeMiddlewares = middlewareParams?.middlewares || [];

    for (const middleware of routeMiddlewares) {
      const name = getMetadata(ComponentConstants.NameKey, middleware);
      const override = getMetadata(ComponentConstants.OverrideKey, middleware);
      const instances = this._ioc.container.resolve<AsenaMiddlewareService<any, any>>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];

      for (const instance of normalizedInstances) {
        middlewares.push({
          middlewareService: instance,
          override,
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
      const path = getMetadata(ComponentConstants.PathKey, webSocket.constructor);

      if (!path) {
        throw new Error('Path not found in WebSocket');
      }

      if (registeredPaths.has(path)) {
        throw new Error(`Duplicate WebSocket path found: ${path}`);
      }

      registeredPaths.add(path);

      const middlewares = await this.prepareTopMiddlewares({ controller: webSocket as unknown as Class }, true);

      this._adapter.websocketAdapter.registerWebSocket(webSocket, this._adapter.prepareMiddlewares(middlewares));
    }

    if (flatWebSockets.length > 0) {
      this._adapter.websocketAdapter.prepareWebSocket(this._wsOptions);
    }
  }

  // todo: this implementation still under development
  private configureErrorHandling() {
    // this._adapter.app.onError((err: Error | HTTPResponseError, c: Context) => {
    //   if (err instanceof HTTPException) {
    //     // Get the custom response
    //     return err.getResponse();
    //   }
    //
    //   return c.json({ message: 'Internal server error' }, ServerErrorStatusCode.INTERNAL_SERVER_ERROR);
    // });
  }

  private prepareLogger() {
    if (!this._logger) {
      this._logger = console;
    }
  }

}
