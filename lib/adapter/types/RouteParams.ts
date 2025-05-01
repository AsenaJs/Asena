import type { HttpMethod } from '../../server/web/types';
import type { AsenaHandler } from './AsenaHandler';
import type { AsenaContext } from '../AsenaContext';
import type { BaseMiddleware, BaseValidator } from './BaseMiddleware';
import type { AsenaWebSocketService } from '../../server/web/websocket';

export interface RouteParams<C extends AsenaContext<any, any>, VS> {
  method: HttpMethod;
  path: string;
  middlewares: BaseMiddleware<C>[];
  handler: AsenaHandler<C>;
  staticServe: boolean;
  staticServeNew: object;
  validator: BaseValidator<VS>;
}

export interface WebsocketRouteParams<C extends AsenaContext<any, any>> {
  path: string;
  middlewares: BaseMiddleware<C>[];
  websocketService: AsenaWebSocketService<any>;
}
