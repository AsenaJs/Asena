import type { AsenaMiddlewareService } from '../middleware';

export interface BaseMiddleware<R, S> {
  middlewareService: AsenaMiddlewareService<R, S>;
  override: boolean;
}
