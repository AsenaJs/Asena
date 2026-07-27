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
  onOpenInternal: (ws: T) => void | Promise<void>;
  onCloseInternal: (ws: T, code: number, reason: string) => void | Promise<void>;
}

/**
 * WebSocket ping strategy for keepalive.
 *
 * - `'adapter'` (default): Disables Bun's native sendPings and uses the adapter's
 *   own heartbeat mechanism via `ws.ping()`. Controlled by `heartbeatInterval` option.
 *   This avoids Bun's aggressive, non-configurable ping timeout (4-16s) that can
 *   kill connections under load. See: https://github.com/oven-sh/bun/issues/26554
 *
 * - `'native'`: Delegates ping/pong entirely to Bun's built-in `sendPings` mechanism.
 *   Bun automatically sends pings and closes connections that don't respond within
 *   its internal timeout. Simpler but less configurable.
 */
export type SendPingStrategy = 'adapter' | 'native';

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

  /**
   * WebSocket ping strategy for keepalive.
   * - 'adapter' (default): Uses adapter's heartbeat mechanism via ws.ping()
   * - 'native': Uses Bun's built-in sendPings
   */
  sendPingStrategy?: SendPingStrategy;

  /**
   * Heartbeat interval in milliseconds.
   * Only used when sendPingStrategy is 'adapter'.
   */
  heartbeatInterval?: number;

  perMessageDeflate?:
    | boolean
    | {
        compress?: WebSocketCompressor | boolean;

        decompress?: WebSocketCompressor | boolean;
      };
}

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
