import type { ComponentParams } from './ComponentParams';
import type { MiddlewareClass } from '../../../server/types';

export interface ControllerParams<R = unknown, S = unknown> extends ComponentParams {
  path: string;
  middlewares?: MiddlewareClass<R, S>[];
}
