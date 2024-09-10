import type { RouteParams } from './types';
import type { BaseMiddleware } from '../server/web/types';

export interface AsenaAdapter<A = unknown, H = unknown, AM = unknown, AH = unknown, R = unknown, S = unknown> {
  app: A;
  setPort: (port: number) => void;
  use: (middleware: BaseMiddleware<R, S>) => void;
  registerRoute: (params: RouteParams<AM, AH>) => void;
  prepareMiddlewares: (middlewares: BaseMiddleware<R, S> | BaseMiddleware<R, S>[]) => any[];
  prepareHandler: (handler: H) => any;
  start: () => Promise<void>;
  onError: (errorHandler: any) => void;
}
