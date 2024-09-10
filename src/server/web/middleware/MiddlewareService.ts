import type { AsenaContext } from '../../../adapter';

export interface MiddlewareService<R, S> {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  handle: (context: AsenaContext<R, S>, next: Function) => void | Promise<void> | any;
}
