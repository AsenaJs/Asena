import type { AsenaContext } from '../AsenaContext';

export type AsenaMiddlewareHandler<R, S> = (
  context: AsenaContext<R, S>,
  next: () => Promise<void>,
) => Promise<void> | any;

export type AsenaNextHandler = () => Promise<void>;
