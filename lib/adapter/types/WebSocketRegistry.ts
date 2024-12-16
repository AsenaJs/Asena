import type { AsenaWebSocketService } from '../../server/web/websocket';
import type { BaseMiddleware } from '../../server/web/types';

export interface WebsocketServiceRegistry<R, S> {
  socket: AsenaWebSocketService<any>;
  middlewares: BaseMiddleware<R, S>[];
}

export type WebSocketRegistry<R, S> = Map<string, WebsocketServiceRegistry<R, S>>;
