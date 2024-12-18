import type { AsenaContext } from '../AsenaContext';

export type AsenaHandler<R = unknown, S = unknown> = (
  context: AsenaContext<R, S>,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => Promise<void | Response> | (Response | void);
