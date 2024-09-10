import type { ComponentParams } from './ComponentParams.ts';

export interface MiddlewareParams extends ComponentParams {
  override?: boolean;
}
