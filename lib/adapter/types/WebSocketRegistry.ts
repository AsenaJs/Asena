import type { AsenaWebSocketService } from '../../server/web/websocket';
import type { BaseMiddleware } from '../../server/web/types';
import type { AsenaContext } from '../AsenaContext';

export interface WebsocketServiceRegistry<C extends AsenaContext<any, any>> {
  socket: AsenaWebSocketService<any>;
  middlewares: BaseMiddleware<C>[];
}

export type WebSocketRegistry<C extends AsenaContext<any, any> = any> = Map<string, WebsocketServiceRegistry<C>>;
