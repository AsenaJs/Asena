import type { HonoRequest } from 'hono';
import { AsenaMiddlewareService } from '../../../server/web/middleware';
import type { AsenaContext } from '../../AsenaContext';

export abstract class MiddlewareService<P extends string = any, I = any> extends AsenaMiddlewareService<
  AsenaContext<HonoRequest<P, I>, Response>
> {}
