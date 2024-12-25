import type { ComponentParams } from './ComponentParams';
import type { MiddlewareClass } from '../../../server/types';
import type { AsenaContext } from '../../../adapter';

export interface ControllerParams<C extends AsenaContext<any, any> = AsenaContext<any, any>> extends ComponentParams {
  path: string;
  middlewares?: MiddlewareClass<C>[];
}
