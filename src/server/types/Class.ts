import type { MiddlewareService } from '../web/middleware/MiddlewareService';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass = Class<MiddlewareService<any, any>>;
