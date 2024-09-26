import type { AsenaMiddlewareService, AsenaValidationService } from '../web/middleware';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass = Class<AsenaMiddlewareService<any, any>>;

export type ValidatorClass<T> = Class<AsenaValidationService<T>>;
