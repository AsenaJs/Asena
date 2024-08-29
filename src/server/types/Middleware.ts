import type { MiddlewareHandler } from 'hono';

export type Middleware = MiddlewareHandler<any, string, {}>;
