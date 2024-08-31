import type { MiddlewareHandler } from 'hono';

export interface Middleware {
  handle: MiddlewareHandler;
}
