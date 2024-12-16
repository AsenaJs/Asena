import type { Context, HonoRequest, MiddlewareHandler, Next } from 'hono';
import { HonoContextWrapper } from '../HonoContextWrapper';
import type { BaseMiddleware } from '../../../server/web/types';
import { createFactory } from 'hono/factory';

export const middlewareParser = (middlewares: BaseMiddleware<HonoRequest, Response>[]): MiddlewareHandler[] => {
  const factory = createFactory();

  return middlewares.map((middleware) => {
    if (middleware.override) {
      // @ts-ignore
      return (c: Context, next: Function) => middleware.handle(c, next);
    }

    return factory.createMiddleware(async (context: Context, next: Next) => {
      await middleware.handle(new HonoContextWrapper(context), next);
    });
  });
};
