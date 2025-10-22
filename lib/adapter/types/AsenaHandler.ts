import type { AsenaContext } from '../AsenaContext';

export type AsenaHandler<C extends AsenaContext<any, any> = any> = (
  context: C,
) => Promise<void | Response> | (Response | void);
