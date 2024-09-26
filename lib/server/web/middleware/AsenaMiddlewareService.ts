import type { AsenaContext } from '../../../adapter';
import type { HonoRequest } from 'hono';

export interface AsenaMiddlewareService<R, S> {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  handle: (context: AsenaContext<R, S>, next: Function) => void | Promise<void> | any;
}

export type MiddlewareService<P extends string = any, I = any> = AsenaMiddlewareService<HonoRequest<P, I>, Response>;
