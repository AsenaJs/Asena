import { type Class, type MiddlewareClass, ServerErrorStatusCode } from './types';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { ComponentType } from '../ioc/types';
import { MiddlewaresKey, NameKey, PathKey } from '../ioc/constants';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from './web/helper';
import type { ApiHandler, Route } from './web/types';
import * as path from 'node:path';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import * as bun from 'bun';
import { every } from 'hono/combine';
import type { ServerLogger } from '../services/types/Logger.ts';
import { HTTPException } from 'hono/http-exception';
import type { HTTPResponseError } from 'hono/types';
import { green, yellow } from '../services';
import type { MiddlewareService } from './web/middleware/MiddlewareService.ts';

export class Server {

  private _port: number;

  private _app: Hono;

  private controllers: Class[] = [];

  private _ioc: IocEngine;

  private _logger: ServerLogger;

  public constructor() {
    const config = readConfigFile();

    if (!config) {
      throw new Error('Config file not found');
    }

    this._ioc = new IocEngine(config);

    this._app = new Hono();

    // Logger setting
    this.prepareLogger();
    // Logger setting
  }

  public async start(): Promise<void> {
    await this._ioc.searchAndRegister();

    this._logger.info('IoC initialized');

    await this.initializeServices();

    this._logger.info('Controllers initializing');

    await this.initializeControllers();

    this._logger.info('Controllers initialized');

    this.configureErrorHandling();

    this._logger.info('Server started on port ' + this._port);

    bun.serve({ port: this._port, fetch: this._app.fetch });
  }

  public port(port: number): Server {
    this._port = port;

    return this;
  }

  public logger(value: ServerLogger): Server {
    this._logger = value;

    return this;
  }

  public getLogger(): ServerLogger {
    return this._logger;
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

        this._app.on([params.method], lastPath, every(...middlewares), controller[name].bind(controller));
      }
    }
  }

  private prepareMiddleware(controller: Class, params: ApiHandler) {
    const topMiddlewares = getMetadata(MiddlewaresKey, controller.constructor) || [];
    const middleWareClasses: MiddlewareClass[] = [...topMiddlewares, ...(params.middlewares || [])];

    const middlewares: MiddlewareHandler[] = [];

    for (const middleware of middleWareClasses) {
      const name = getMetadata(NameKey, middleware);

      let instances = this._ioc.container.get<MiddlewareService>(name);

      if (!instances) {
        continue;
      }

      instances = Array.isArray(instances) ? instances : [instances];

      for (const instance of instances) {
        middlewares.push(instance.handle.bind(instance));
      }
    }

    return middlewares;
  }

  // todo: this implementation still under development idk
  private async initializeServices() {}

  private configureErrorHandling() {
    this._app.onError((err: Error | HTTPResponseError, c: Context) => {
      if (err instanceof HTTPException) {
        // Get the custom response
        return err.getResponse();
      }

      return c.json({ message: 'Internal server error' }, ServerErrorStatusCode.INTERNAL_SERVER_ERROR);
    });
  }

  private prepareLogger() {
    if (!this._logger) {
      this._logger = console;
    }
  }

}
