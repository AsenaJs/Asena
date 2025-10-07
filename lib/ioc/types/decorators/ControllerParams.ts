import type { ComponentParams } from './ComponentParams';
import type { AsenaContext } from '../../../adapter';
import type { MiddlewareClass } from '../../../server/web/middleware';

export interface ControllerParams<C extends AsenaContext<any, any> = AsenaContext<any, any>> extends ComponentParams {
  path: string;
  middlewares?: MiddlewareClass<C>[];
}
