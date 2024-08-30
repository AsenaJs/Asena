import { type Class, ServerErrorStatusCode } from './types';
import { IocEngine } from '../ioc';
import { readConfigFile } from '../ioc/helper/fileHelper';
import { ComponentType } from '../ioc/types';
import { PathKey } from '../ioc/constants';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from './web/helper';
import type { Route } from './web/types';
import * as path from 'node:path';
import { type Context, Hono } from 'hono';
import * as bun from 'bun';
import { every } from 'hono/combine';
import type { ServerLogger } from '../services/types/Logger.ts';
import { HTTPException } from 'hono/http-exception';
import type { HTTPResponseError } from 'hono/types';

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

      this._logger.info(this.controllers.length.toString() + ' controllers found');
    }

    for (const controller of this.controllers) {
      const routes: Route = getMetadata(RouteKey, controller) || {};

      const routePath: string = getMetadata(PathKey, controller.constructor) || '';

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(routePath, params.path);

        this._logger.info(
          `METHOD: ${params.method.toUpperCase()}, PATH: ${lastPath}, DESCRIPTION: ${params.description}, api ready`,
        );

        this._app.on([params.method], lastPath, every(...params.middlewares), controller[name].bind(controller));
      }
    }
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
