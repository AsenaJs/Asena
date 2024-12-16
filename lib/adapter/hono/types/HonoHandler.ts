import type { HonoRequest } from 'hono';
import type { ErrorHandler } from '../../types';
import type { AsenaHandler } from '../../types/AsenaHandler';

export type HonoHandler = AsenaHandler<HonoRequest, Response>;
export type HonoErrorHandler = ErrorHandler<HonoRequest, Response>;
