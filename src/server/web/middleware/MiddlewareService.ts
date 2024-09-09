import type { AsenaContext } from '../../../adapter/AsenaContext.ts';

export interface MiddlewareService<R, S> {
  handle: (context: AsenaContext<R, S>, next: Function) => void | Promise<void>;
}
