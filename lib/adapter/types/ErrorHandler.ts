import type { AsenaContext } from '../AsenaContext';

export type ErrorHandler<C extends AsenaContext<any, any>> = (error: Error, context: C) => Response | Promise<Response>;
