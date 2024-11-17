import { AsenaAdapter } from '../AsenaAdapter';
import { type Context, Hono, type HonoRequest, type MiddlewareHandler, type Next } from 'hono';
import type { Server } from 'bun';
import * as bun from 'bun';
import type { RouteParams } from '../types';
import { createFactory } from 'hono/factory';
import type { H } from 'hono/types';
import { DefaultContextWrapper } from './DefaultContextWrapper';
import { HttpMethod } from '../../server/web/http';
import type { BaseMiddleware } from '../../server/web/types';
import type { ErrorHandler, Handler } from './types';
import type { ValidatorClass } from '../../server/types';
import { green, type ServerLogger, yellow } from '../../services';
import type { AsenaWebsocketAdapter } from '../AsenaWebsocketAdapter';

export class DefaultAdapter extends AsenaAdapter<Hono, Handler, MiddlewareHandler, H> {

  private static readonly VALIDATOR_METHODS = ['json', 'query', 'form', 'param', 'header'] as const;

  public app = new Hono();

  private server: Server;

  private readonly methodMap = {
    [HttpMethod.GET]: (path: string, ...handlers: any[]) => this.app.get(path, ...handlers),
    [HttpMethod.POST]: (path: string, ...handlers: any[]) => this.app.post(path, ...handlers),
    [HttpMethod.PUT]: (path: string, ...handlers: any[]) => this.app.put(path, ...handlers),
    [HttpMethod.DELETE]: (path: string, ...handlers: any[]) => this.app.delete(path, ...handlers),
    [HttpMethod.PATCH]: (path: string, ...handlers: any[]) => this.app.patch(path, ...handlers),
    [HttpMethod.OPTIONS]: (path: string, ...handlers: any[]) => this.app.options(path, ...handlers),
    [HttpMethod.CONNECT]: (path: string, ...handlers: any[]) =>
      this.app.on(HttpMethod.CONNECT.toUpperCase(), path, ...handlers),
    [HttpMethod.HEAD]: (path: string, ...handlers: any[]) =>
      this.app.on(HttpMethod.HEAD.toUpperCase(), path, ...handlers),
    [HttpMethod.TRACE]: (path: string, ...handlers: any[]) =>
      this.app.on(HttpMethod.TRACE.toUpperCase(), path, ...handlers),
  };

  public constructor(websocketAdapter: AsenaWebsocketAdapter<any, any>, logger?: ServerLogger) {
    super(websocketAdapter, logger);
    this.websocketAdapter.app = this.app;

    // to ensure that the logger is set
    if (!this.websocketAdapter.logger && logger) {
      this.websocketAdapter.logger = this.logger;
    }
  }

  public use(middleware: BaseMiddleware<HonoRequest, Response>, path?: string) {
    const normalizedPath = path ? this.normalizePath(path) : undefined;
    const preparedMiddlewares = this.prepareMiddlewares(middleware);

    if (normalizedPath) {
      this.app.use(normalizedPath, ...preparedMiddlewares);
      return;
    }

    this.app.use(...preparedMiddlewares);
  }

  public registerRoute({
    method,
    path,
    middleware,
    handler,
    staticServe,
    validator,
  }: RouteParams<MiddlewareHandler, H>) {
    const middlewares = validator ? [...validator, ...middleware] : middleware;
    const routeHandler = staticServe ? middleware : [...middlewares, handler];

    const methodHandler = this.methodMap[method];

    if (!methodHandler) {
      throw new Error('Invalid method');
    }

    methodHandler(path, ...routeHandler);
    this.logger.info(
      `${green('Successfully')} registered ${yellow(method.toUpperCase())} route for PATH: ${green(`/${path}`)}`,
    );
  }

  public async start() {
    this.websocketAdapter.buildWebsocket();

    this.server = bun.serve({ port: this.port, fetch: this.app.fetch, websocket: this.websocketAdapter.websocket });

    this.websocketAdapter.startWebsocket(this.server);

    return this.server;
  }

  public prepareMiddlewares(
    middlewares: BaseMiddleware<HonoRequest, Response> | BaseMiddleware<HonoRequest, Response>[],
  ) {
    const _middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];

    const factory = createFactory();

    return _middlewares.map((middleware) => {
      if (middleware.override) {
        return (c, next) => middleware.middlewareService.handle(c, next);
      }

      return factory.createMiddleware(async (context: Context, next: Next) => {
        await middleware.middlewareService.handle(new DefaultContextWrapper(context), next);
      });
    });
  }

  public prepareHandler(handler: () => Handler) {
    return (c: Context) => handler()(new DefaultContextWrapper(c));
  }

  public onError(errorHandler: ErrorHandler) {
    this.app.onError((error, context) => {
      return errorHandler(error, new DefaultContextWrapper(context));
    });
  }

  public setPort(port: number) {
    this.port = port;
  }

  public prepareValidator(Validator: ValidatorClass<MiddlewareHandler>) {
    if (!Validator) {
      return [];
    }

    const validatorInstance = new Validator();

    return DefaultAdapter.VALIDATOR_METHODS.filter((key) => validatorInstance[key]).map((key) => {
      return validatorInstance[key]();
    });
  }

  private normalizePath(path: string): string {
    return `${path.endsWith('/') ? path : `${path}/`}*`;
  }

}
