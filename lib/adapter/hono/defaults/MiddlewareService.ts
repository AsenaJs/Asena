import type { HonoRequest } from 'hono';
import { AsenaMiddlewareService } from '../../../server/web/middleware';

export abstract class MiddlewareService<P extends string = any, I = any> extends AsenaMiddlewareService<
  HonoRequest<P, I>,
  Response
> {}
