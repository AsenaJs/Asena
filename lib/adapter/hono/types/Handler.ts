import type { HonoRequest } from 'hono';
import type { AsenaContext } from '../../AsenaContext';
import type { ErrorHandler } from '../../types';

export type Handler = (context: AsenaContext<HonoRequest, Response>) => any | Promise<any>;
export type HonoErrorHandler = ErrorHandler<HonoRequest, Response>;
