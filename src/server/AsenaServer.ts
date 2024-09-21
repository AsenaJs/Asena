import type { Class, MiddlewareClass } from './types';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { ComponentType } from '../ioc/types';
import { MiddlewaresKey, NameKey, OverrideKey, PathKey } from '../ioc/constants';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from './web/helper';
import type { ApiHandler, BaseMiddleware, Route } from './web/types';
import * as path from 'node:path';
import type { AsenaService, ServerLogger } from '../services';
import { green, yellow } from '../services';
import type { MiddlewareService } from './web/middleware';
import type { AsenaAdapter } from '../adapter';
import { DefaultAdapter } from '../adapter/defaultAdapter';

export class AsenaServer {

  private _port: number;

  private controllers: Class[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  private _adapter: AsenaAdapter<any, any, any, any, any>;

  public constructor(adapter?: AsenaAdapter<any, any, any, any, any>) {
    const config = readConfigFile();

    if (!config) {
      throw new Error('Config file not found');
    }

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
    await this._ioc.searchAndRegister();

    this._logger.info(`
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \\__ \\ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                            `);

    this._logger.info('IoC initialized');

    await this.prepareServerServices();

    this._logger.info('Controllers initializing');

    await this.initializeControllers();

    this._logger.info('Controllers initialized');

    this.configureErrorHandling();

    this._logger.info('Server started on port ' + this._port);

    await this._adapter.start();
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

  private async initializeControllers(): Promise<void> {
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
      const routes: Route = getMetadata(RouteKey, controller) || {};

      const routePath: string = getMetadata(PathKey, controller.constructor) || '';

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(routePath, params.path);

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

  private prepareMiddleware(controller: Class, params: ApiHandler) {
    const topMiddlewares = getMetadata(MiddlewaresKey, controller.constructor) || [];
    const middleWareClasses: MiddlewareClass[] = [...topMiddlewares, ...(params.middlewares || [])];

    const middlewares: BaseMiddleware<any, any>[] = [];

    for (const middleware of middleWareClasses) {
      const name = getMetadata(NameKey, middleware);
      const override = getMetadata(OverrideKey, middleware);

      let instances = this._ioc.container.get<MiddlewareService<any, any>>(name);

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

  private async prepareServerServices() {
    const serverServices: (AsenaService | AsenaService[])[] = this._ioc.container.getAll<AsenaService>(
      ComponentType.SERVER_SERVICE,
    );

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
