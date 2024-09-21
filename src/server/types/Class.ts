import type { MiddlewareService, ValidationService } from '../web/middleware';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass = Class<MiddlewareService<any, any>>;

export type ValidatorClass<T> = Class<ValidationService<T>>;
