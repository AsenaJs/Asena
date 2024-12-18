import type { HttpMethod } from '../../server/web/http';
import type { BaseMiddleware, BaseValidator } from '../../server/web/types';
import type { AsenaHandler } from './AsenaHandler';

export interface RouteParams<R, S, VS> {
  method: HttpMethod;
  path: string;
  middleware: BaseMiddleware<R, S>[];
  handler: AsenaHandler<R, S>;
  staticServe: boolean;
  validator: BaseValidator<VS>;
}
