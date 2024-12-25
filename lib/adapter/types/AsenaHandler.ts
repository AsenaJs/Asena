import type { AsenaContext } from '../AsenaContext';

export type AsenaHandler<C extends AsenaContext<any, any> = any> = (
  context: C,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => Promise<void | Response> | (Response | void);
