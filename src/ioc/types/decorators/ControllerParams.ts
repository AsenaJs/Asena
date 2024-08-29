import type { ComponentParams } from './ComponentParams';
import type { Middleware } from '../../../server/types/Middleware';

export interface ControllerParams extends ComponentParams {
  path: string;
  middlewares?: Middleware[];
}
