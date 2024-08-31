import type { MiddlewareHandler } from 'hono';

export interface MiddlewareService {
  handle: MiddlewareHandler;
}
