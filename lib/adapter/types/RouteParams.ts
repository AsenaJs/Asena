import type { HttpMethod } from '../../server/web/types';
import type { AsenaHandler } from './AsenaHandler';
import type { AsenaContext } from '../AsenaContext';
import type {BaseMiddleware, BaseValidator} from "./BaseMiddleware";

export interface RouteParams<C extends AsenaContext<any, any>, VS> {
  method: HttpMethod;
  path: string;
  middleware: BaseMiddleware<C>[];
  handler: AsenaHandler<C>;
  staticServe: boolean;
  validator: BaseValidator<VS>;
}
