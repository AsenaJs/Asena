import type { AsenaMiddlewareService, AsenaValidationService } from '../web/middleware';
import type { AsenaContext } from '../../adapter';

export type Class<T = any> = new (...args: any[]) => T;

export type MiddlewareClass<C extends AsenaContext<any, any> = AsenaContext<any, any>> = Class<
  AsenaMiddlewareService<C>
>;

export type ValidatorClass<S = unknown> = Class<AsenaValidationService<S>>;
