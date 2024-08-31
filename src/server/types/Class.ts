import type { MiddlewareService } from '../web/middleware/MiddlewareService.ts';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass = Class<MiddlewareService>;
