import type { AsenaMiddlewareService } from '../middleware';
import type { Class } from '../../types';
import type { ApiHandler } from './ApiHandler';

export interface BaseMiddleware<R, S> {
  middlewareService: AsenaMiddlewareService<R, S>;
  override: boolean;
}

export interface PrepareMiddlewareParams {
  controller: Class;
  routePath?: string;
  params?: ApiHandler;
}
