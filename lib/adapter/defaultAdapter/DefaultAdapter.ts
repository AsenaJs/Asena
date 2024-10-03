import { AsenaAdapter } from '../AsenaAdapter';
import { type Context, Hono, type HonoRequest, type MiddlewareHandler, type Next } from 'hono';
import type { Server, ServerWebSocket } from 'bun';
import * as bun from 'bun';
import type { RouteParams } from '../types';
import { createFactory } from 'hono/factory';
import type { H } from 'hono/types';
import { DefaultContextWrapper } from './DefaultContextWrapper';
import { HttpMethod } from '../../server/web/http';
import type { BaseMiddleware } from '../../server/web/types';
import type { ErrorHandler, Handler } from './types';
import type { ValidatorClass } from '../../server/types';
import type { WebSocketData, WebSocketHandlerWithPath, WSEvents, WSOptions } from '../../server/web/websocket';

export class DefaultAdapter extends AsenaAdapter<Hono, Handler, MiddlewareHandler, H> {

  public app = new Hono();

  private server: Server;

  public use(middleware: BaseMiddleware<HonoRequest, Response>) {
    this.app.use(...this.prepareMiddlewares(middleware));
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

    switch (method) {
      case HttpMethod.GET:
        this.app.get(path, ...routeHandler);

        break;

      case HttpMethod.POST:
        this.app.post(path, ...routeHandler);

        break;

      case HttpMethod.PUT:
        this.app.put(path, ...routeHandler);

        break;

      case HttpMethod.DELETE:
        this.app.delete(path, ...routeHandler);

        break;

      case HttpMethod.PATCH:
        this.app.patch(path, ...routeHandler);

        break;

      case HttpMethod.OPTIONS:
        this.app.options(path, ...routeHandler);

        break;

      case HttpMethod.CONNECT:
        this.app.on(HttpMethod.CONNECT.toUpperCase(), path, ...routeHandler);

        break;

      case HttpMethod.HEAD:
        this.app.on(HttpMethod.HEAD.toUpperCase(), path, ...routeHandler);

        break;

      case HttpMethod.TRACE:
        this.app.on(HttpMethod.TRACE.toUpperCase(), path, ...routeHandler);

        break;

      default:
        throw new Error('Invalid method');
    }
  }

  public async start() {
    if (this.websocketHandlers) {
      for (const handler of this.websocketHandlers) {
        this.upgradeWebSocket(handler);
      }
    }

    this.server = bun.serve({ port: this.port, fetch: this.app.fetch, websocket: this.websocket });

    return this.server;
  }

  public prepareMiddlewares(
    middlewares: BaseMiddleware<HonoRequest, Response> | BaseMiddleware<HonoRequest, Response>[],
  ) {
    const _middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];

    const factory = createFactory();

    return _middlewares.map((middleware) => {
      if (middleware.override) {
        return middleware.middlewareService.handle.bind(middleware.middlewareService);
      }

      return factory.createMiddleware(async (context: Context, next: Next) => {
        await middleware.middlewareService.handle(new DefaultContextWrapper(context), next);
      });
    });
  }

  public prepareHandler(handler: Handler) {
    return async function (context: Context) {
      return await handler(new DefaultContextWrapper(context));
    };
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

    return ['json', 'query', 'form', 'param', 'header']
      .filter((key) => validatorInstance[key])
      .map((key) => {
        return validatorInstance[key]().bind(validatorInstance);
      });
  }

  public registerWebSocketHandler(websocketHandlers: WebSocketHandlerWithPath<MiddlewareHandler>): void {
    if (this.websocketHandlers === undefined) {
      this.websocketHandlers = [];
    }

    this.websocketHandlers.push(websocketHandlers);
  }

  public prepareWebSocket(options?: WSOptions): void {
    const createHandler =
      (type: keyof WSEvents) =>
      (ws: ServerWebSocket<WebSocketData>, ...args: any[]) => {
        const handler = this.websocketHandlers.find((h) => h.path === ws.data.path);

        if (handler?.[type]) {
          // @ts-ignore

          handler[type](ws, ...args);
        }
      };

    this.websocket = {
      open: createHandler('onOpen'),
      message: createHandler('onMessage'),
      drain: createHandler('onDrain'),
      close: createHandler('onClose'),
      ping: createHandler('onPing'),
      pong: createHandler('onPong'),
      ...options,
    };
  }

  private upgradeWebSocket(handler: WebSocketHandlerWithPath<MiddlewareHandler>): void {
    this.app.get(`/${handler.path}`, ...handler.middlewares, async (c: Context, next) => {
      const websocketData = c.get('_websocketData') || {};

      const id = crypto.randomUUID();

      const data: WebSocketData = { values: websocketData, id, path: handler.path };
      const upgradeResult = this.server.upgrade(c.req.raw, { data });

      if (upgradeResult) {
        return new Response(null);
      }

      await next(); // Failed
    });
  }

}
