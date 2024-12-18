import type { AsenaContext } from '../AsenaContext';

export type ErrorHandler<R, S> = (error: Error, context: AsenaContext<R, S>) => Response | Promise<Response>;
