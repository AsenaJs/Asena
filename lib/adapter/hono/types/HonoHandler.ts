import type { ErrorHandler } from '../../types';
import type { AsenaHandler } from '../../types/AsenaHandler';
import type { Context } from '../defaults';

export type HonoHandler = AsenaHandler<Context>;
export type HonoErrorHandler = ErrorHandler<Context>;
