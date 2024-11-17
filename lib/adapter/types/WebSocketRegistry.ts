import type { AsenaWebSocketService } from '../../server/web/websocket';
import type { MiddlewareHandler } from 'hono';

export interface WebsocketServiceRegistry<MH> {
  socket: AsenaWebSocketService<any>;
  middlewares: MH[];
}

export type WebSocketRegistry<MH = MiddlewareHandler> = Map<string, WebsocketServiceRegistry<MH>>;
