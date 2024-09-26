import type { ComponentParams } from './ComponentParams';
import type { MiddlewareClass } from '../../../server/types';

export interface ControllerParams extends ComponentParams {
  path: string;
  middlewares?: MiddlewareClass[];
}
