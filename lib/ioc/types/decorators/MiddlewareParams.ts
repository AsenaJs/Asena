import type { ComponentParams } from './ComponentParams';

export interface MiddlewareParams extends ComponentParams {
  override?: boolean;
}
