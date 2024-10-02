import type { Class, MiddlewareClass } from './types';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { type Component, ComponentType } from '../ioc/types';
import { getMetadata } from 'reflect-metadata/no-conflict';
import type { ApiHandler, BaseMiddleware, Route } from './web/types';
import * as path from 'node:path';
import type { AsenaService, ServerLogger } from '../services';
import { green, yellow } from '../services';
import type { AsenaMiddlewareService } from './web/middleware';
import type { AsenaAdapter } from '../adapter';
import { DefaultAdapter } from '../adapter/defaultAdapter';
import type { AsenaWebSocketService, WebSocketData } from './web/websocket';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from '../adapter/AsenaWebsocketAdapter';
import { ComponentConstants } from '../ioc/constants';
import { AsenaWebSocketServer } from './web/websocket/AsenaWebSocketServer';

export class AsenaServer {

  private _port: number;

  private controllers: Class[] = [];

  private _components: Component[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  private _adapter: AsenaAdapter<any, any, any, any, any, any, AsenaWebsocketAdapter<any, any>>;

  private server: Server;

  public constructor(adapter?: AsenaAdapter<any, any, any, any, any>) {
    // TODO: those are causing bugs some times we need to put them into another place
    const config = readConfigFile();

    this._ioc = new IocEngine(config);

    if (!adapter) {
      this._adapter = new DefaultAdapter();
    } else {
      this._adapter = adapter;
    }

    // Logger setting
    this.prepareLogger();
    // Logger setting
  }

  public async start(): Promise<void> {
    await this._ioc.searchAndRegister(this._components);

    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                            `);

    this._logger.info('IoC initialized');

    await this.prepareServerServices();

    this.initializeControllers();

    this.prepareWebSocket();

    this.configureErrorHandling();

    this._logger.info('Server started on port ' + this._port);

    this.server = await this._adapter.start();

    this.updateWebSockets();
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

    this._adapter.setPort(port);

    return this;
  }

  public logger(value: ServerLogger): AsenaServer {
    this._logger = value;

    return this;
  }

  private initializeControllers() {
    const controllers = this._ioc.container.getAll<Class>(ComponentType.CONTROLLER);

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

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(`${routePath}/`, params.path);

        this._logger.info(
          `METHOD: ${yellow(params.method.toUpperCase())}, PATH: ${yellow(lastPath)}${params.description ? `, DESCRIPTION: ${params.description}` : ''}, ${green('READY')}`,
        );

        const middlewares = this.prepareMiddleware(controller, params);

        this._adapter.registerRoute({
          method: params.method,
          path: lastPath,
          middleware: this._adapter.prepareMiddlewares(middlewares),
          handler: this._adapter.prepareHandler(controller[name].bind(controller)),
          staticServe: params.staticServe,
          validator: this._adapter.prepareValidator(params.validator),
        });
      }
    }
  }

  private prepareMiddleware(controller: Class, params?: ApiHandler) {
    const topMiddlewares = getMetadata(ComponentConstants.MiddlewaresKey, controller.constructor) || [];
    const middleWareClasses: MiddlewareClass[] = [...topMiddlewares, ...(params?.middlewares || [])];

    const middlewares: BaseMiddleware<any, any>[] = [];

    for (const middleware of middleWareClasses) {
      const name = getMetadata(ComponentConstants.NameKey, middleware);
      const override = getMetadata(ComponentConstants.OverrideKey, middleware);

      let instances = this._ioc.container.get<AsenaMiddlewareService<any, any>>(name);

      if (!instances) {
        continue;
      }

      instances = Array.isArray(instances) ? instances : [instances];

      for (const instance of instances) {
        middlewares.push({ middlewareService: instance, override });
      }
    }

    return middlewares;
  }

  private prepareWebSocket() {
    const webSockets = this._ioc.container.getAll<AsenaWebSocketService<WebSocketData>>(ComponentType.WEBSOCKET);

    if (!webSockets) {
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

      const middlewares = this.prepareMiddleware(webSocket as unknown as Class);

      this._adapter.websocketAdapter.registerWebSocket(webSocket, this._adapter.prepareMiddlewares(middlewares));

      this._logger.info(
        `WebSocket: ${green(webSocket.constructor.name)} initialized with path: ${yellow(`/${path}`)} ${green('READY')}`,
      );

      if (flatWebSockets.length > 0) {
        this._adapter.websocketAdapter.prepareWebSocket();
      }
    }
  }

  private updateWebSockets() {
    const webSockets = this._ioc.container.getAll<AsenaWebSocketService<WebSocketData>>(ComponentType.WEBSOCKET);

    if (!webSockets) {
      return;
    }

    // flat the array
    const flatWebSockets = webSockets.flat();

    for (const webSocket of flatWebSockets) {
      // getPath key
      const path = getMetadata(ComponentConstants.PathKey, webSocket.constructor);

      webSocket.server = new AsenaWebSocketServer(this.server, path);
    }
  }

  private async prepareServerServices() {
    const serverServices: (AsenaService | AsenaService[])[] = this._ioc.container.getAll<AsenaService>(
      ComponentType.SERVER_SERVICE,
    );

    if (!serverServices) {
      this._logger.info('No server services found');

      return;
    }

    // flat the array
    const flatServerServices = serverServices.flat();

    for (const service of flatServerServices) {
      this._logger.info(`Service: ${green(service.constructor.name)} found`);

      // Todo: This is a temporary solution. We need to find a better way to handle this. Maybe create a interface with then using it with proxy idk.
      if (service['onStart']) {
        await service['onStart']();
      }

      this._logger.info(`Service: ${green(service.constructor.name)} initialized`);
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
