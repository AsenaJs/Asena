import type { AsenaWebSocketService } from '../../server/web/websocket';

export type WebSocketRegistry = Map<string, AsenaWebSocketService<any>>;
