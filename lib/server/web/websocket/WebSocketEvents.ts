import type { ServerWebSocket, WebSocketCompressor } from 'bun';

/**
 * Interface representing WebSocket events.
 *
 * @template T - The type of the WebSocket.
 */
export interface WSEvents<T extends ServerWebSocket<any> = ServerWebSocket<any>> {
  onOpen?: (ws: T) => void | Promise<void>;
  onMessage?: (ws: T, message: Buffer | string) => void | Promise<void>;
  onDrain?: (ws: T) => void | Promise<void>;
  onClose?: (ws: T, code: number, reason: string) => void | Promise<void>;
  onPing?: (ws: T, data: Buffer) => void | Promise<void>;
  onPong?: (ws: T, data: Buffer) => void | Promise<void>;
}

/**
 * Options for configuring the WebSocket server.
 */
export interface WSOptions {
  maxPayloadLimit?: number;
  backpressureLimit?: number;
  closeOnBackpressureLimit?: boolean;
  idleTimeout?: number;
  publishToSelf?: boolean;
  sendPings?: boolean;
  perMessageDeflate:
    | boolean
    | {
        compress?: WebSocketCompressor | boolean;

        decompress?: WebSocketCompressor | boolean;
      };
}

/**
 * Represents a WebSocket handler with a specific path and associated middlewares.
 *
 * @template MH - The type of the middlewares handlers.
 * @template T - The type of the WebSocket data.
 */
export type WebSocketHandlerWithPath<MH, T = any> = {
  path: string;
  middlewares: MH[];
} & WSEvents<ServerWebSocket<T>>;

/**
 * Interface representing the data associated with a WebSocket connection.
 *
 * @template T - The type of the values associated with the WebSocket data.
 */
export interface WebSocketData<T = any> {
  values: T;
  id: string;
  path: string;
}
