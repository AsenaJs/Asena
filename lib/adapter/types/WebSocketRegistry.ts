import type { AsenaWebSocketService } from '../../server/web/websocket';

export interface WebsocketServiceRegistry<MH> {
  socket: AsenaWebSocketService<any>;
  middlewares: MH[];
}

export type WebSocketRegistry<MH> = Map<string, WebsocketServiceRegistry<MH>>;
