import type { HonoRequest } from 'hono';
import type { AsenaContext } from '../../AsenaContext.ts';

export type Handler = (context: AsenaContext<HonoRequest, Response>) => any | Promise<any>;
export type ErrorHandler = (error: Error, context: AsenaContext<HonoRequest, Response>) => Response | Promise<Response>;
