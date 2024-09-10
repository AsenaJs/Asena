import type { MiddlewareService } from '../web/middleware';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass = Class<MiddlewareService<any, any>>;
