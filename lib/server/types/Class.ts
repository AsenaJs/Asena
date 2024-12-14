import type { AsenaMiddlewareService, AsenaValidationService } from '../web/middleware';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass<R = unknown, S = unknown> = Class<AsenaMiddlewareService<R, S>>;

export type ValidatorClass<S = unknown> = Class<AsenaValidationService<S>>;
