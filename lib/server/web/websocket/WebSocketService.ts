import type { Server, ServerWebSocket } from 'bun';
import type { WebSocketData } from './WebSocketEvents';

// TODO: server needs to be a generic , also write default implementation for server object it needs to have sockets

/**
 * A service class for handling WebSocket connections.
 *
 * @template T - The type of data expected in the WebSocket object.
 */
export class AsenaWebSocketService<T> {

  public server: Server = null;

  public onMessage?(ws: Socket<T>, message: Buffer | string): void | Promise<void>;

  public onDrain?(ws: Socket<T>): void | Promise<void>;

  public onClose?(ws: Socket<T>, code: number, reason: string): void | Promise<void>;

  public onPing?(ws: Socket<T>, data: Buffer): void | Promise<void>;

  public onPong?(ws: Socket<T>, data: Buffer): void | Promise<void>;

  public onOpen?(ws: Socket<T>): void | Promise<void>;

}

/**
 * Represents a WebSocket connection with a specific type of data.
 *
 * @template T - The type of data expected in the WebSocket object.
 */
export type Socket<T = any> = ServerWebSocket<WebSocketData<T>>;
