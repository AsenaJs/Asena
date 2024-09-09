import type { AsenaAdapter } from '../AsenaAdapter.ts';
import { type Context, Hono, type HonoRequest, type MiddlewareHandler, type Next } from 'hono';
import * as bun from 'bun';
import type { RouteParams } from '../types/routeParams.ts';
import type { ErrorHandler, Handler } from '../types';
import { createFactory } from 'hono/factory';
import type { H } from 'hono/types';
import { DefaultContextWrapper } from './DefaultContextWrapper.ts';
import { HttpMethod } from '../../server/types/index.ts';
import type { MiddlewareService } from '../../server/web/middleware/MiddlewareService.ts';

export class DefaultAdapter
  implements AsenaAdapter<Hono, MiddlewareService<HonoRequest, Response>, Handler, MiddlewareHandler, H>
{

  public app = new Hono();

  protected port: number;

  public setPort(port: number) {
    this.port = port;
  }

  public use(middleware: MiddlewareService<HonoRequest, Response>) {
    this.app.use(...this.prepareMiddlewares(middleware));
  }

  public registerRoute({ method, path, middleware, handler }: RouteParams<MiddlewareHandler, H>) {
    switch (method) {
      case HttpMethod.GET:
        this.app.get(path, ...middleware, handler);

        break;

      case HttpMethod.POST:
        this.app.post(path, ...middleware, handler);

        break;

      case HttpMethod.PUT:
        this.app.put(path, ...middleware, handler);

        break;

      case HttpMethod.DELETE:
        this.app.delete(path, ...middleware, handler);

        break;

      case HttpMethod.PATCH:
        this.app.patch(path, ...middleware, handler);

        break;

      case HttpMethod.OPTIONS:
        this.app.options(path, ...middleware, handler);

        break;

      case HttpMethod.CONNECT:
        this.app.on(HttpMethod.CONNECT.toUpperCase(), path, ...middleware, handler);

        break;

      case HttpMethod.HEAD:
        this.app.on(HttpMethod.HEAD.toUpperCase(), path, ...middleware, handler);

        break;

      case HttpMethod.TRACE:
        this.app.on(HttpMethod.TRACE.toUpperCase(), path, ...middleware, handler);

        break;

      default:
        throw new Error('Invalid method');
    }
  }

  public async start() {
    bun.serve({ port: this.port, fetch: this.app.fetch });
  }

  public prepareMiddlewares(
    middlewares: MiddlewareService<HonoRequest, Response> | MiddlewareService<HonoRequest, Response>[],
  ) {
    const _middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];

    const factory = createFactory();

    return _middlewares.map((middleware) => {
      return factory.createMiddleware(async (context: Context, next: Next) => {
        await middleware.handle(new DefaultContextWrapper(context), next);
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

}
