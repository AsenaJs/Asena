import type { MiddlewareService } from '../middleware';

export interface BaseMiddleware<R, S> {
  middlewareService: MiddlewareService<R, S>;
  override: boolean;
}
