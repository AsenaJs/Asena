import type { Socket, WebSocketWithId } from './types';
import type { AsenaWebSocketServer } from './AsenaWebSocketServer';

// TODO: server needs to be a generic , also write default implementation for server object it needs to have sockets

/**
 * A service class for handling WebSocket connections.
 *
 * @template T - The type of data expected in the WebSocket object.
 */
export class AsenaWebSocketService<T> {

  /**
   * The WebSocket server instance.
   */
  public server: AsenaWebSocketServer = null;

  /**
   * An array to store WebSocket connections with their IDs.
   */
  private _sockets: WebSocketWithId<any>[]= [];

  /**
   * Handles incoming messages from the WebSocket connection.
   *
   * @param ws - The WebSocket connection.
   * @param message - The message received, which can be a Buffer or a string.
   * @returns A promise that resolves to void or void.
   */
  protected onMessage?(ws: Socket<T>, message: Buffer | string): void | Promise<void>;

  /**
   * Handles the drain event for the WebSocket connection.
   *
   * @param ws - The WebSocket connection.
   * @returns A promise that resolves to void or void.
   */
  protected onDrain?(ws: Socket<T>): void | Promise<void>;

  /**
   * Handles the close event for the WebSocket connection.
   *
   * @param ws - The WebSocket connection.
   * @param code - The close code sent by the server.
   * @param reason - The reason for the connection closure.
   * @returns A promise that resolves to void or void.
   */
  protected onClose?(ws: Socket<T>, code: number, reason: string): void | Promise<void>;

  /**
   * Handles the ping event for the WebSocket connection.
   *
   * @param ws - The WebSocket connection.
   * @param data - The data received with the ping.
   * @returns A promise that resolves to void or void.
   */
  protected onPing?(ws: Socket<T>, data: Buffer): void | Promise<void>;

  /**
   * Handles the pong event for the WebSocket connection.
   *
   * @param ws - The WebSocket connection.
   * @param data - The data received with the pong.
   * @returns A promise that resolves to void or void.
   */
  protected onPong?(ws: Socket<T>, data: Buffer): void | Promise<void>;

  /**
   * Handles the open event for the WebSocket connection.
   *
   * @param ws - The WebSocket connection.
   * @returns A promise that resolves to void or void.
   */
  protected onOpen?(ws: Socket<T>): void | Promise<void>;

  /**
   * Gets the array of WebSocket connections with their IDs.
   *
   * @returns {WebSocketWithId<any>[]} The array of WebSocket connections with their IDs.
   */
  public get sockets(): WebSocketWithId<any>[] {
    return this._sockets;
  }

  /**
   * Sets the array of WebSocket connections with their IDs.
   *
   * @param {WebSocketWithId<any>[]} sockets - The array of WebSocket connections with their IDs.
   */
  public set sockets(sockets: WebSocketWithId<any>[]) {
    this._sockets = sockets;
  }

}
