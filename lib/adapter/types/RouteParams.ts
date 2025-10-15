import type { HttpMethod } from '../../server/web/types';
import type { AsenaHandler } from './AsenaHandler';
import type { AsenaContext } from '../AsenaContext';
import type { BaseMiddleware, BaseValidator } from './BaseMiddleware';
import type { AsenaWebSocketService } from '../../server/web/websocket';
import type { BaseStaticServeParams } from './BaseStaticServeParams';

export interface RouteParams<C extends AsenaContext<any, any>, VS, E = any> {
  method: HttpMethod;
  path: string;
  middlewares: BaseMiddleware<C>[];
  handler: AsenaHandler<C>;
  staticServe: BaseStaticServeParams<C, E>;
  validator: BaseValidator<VS>;
  controllerName?: string;
  controllerBasePath?: string;
}

export interface WebsocketRouteParams<C extends AsenaContext<any, any>> {
  path: string;
  middlewares: BaseMiddleware<C>[];
  websocketService: AsenaWebSocketService<any>;
  controllerName?: string;
}
