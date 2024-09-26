import type { AsenaContext } from '../../AsenaContext';
import type { HonoRequest } from 'hono';

export type Context<P extends string = any, I = any, R = Response> = AsenaContext<HonoRequest<P, I>, R>;
