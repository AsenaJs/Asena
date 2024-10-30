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
  private _sockets: WebSocketWithId<any>[] = [];

  /**
   * The namespace for the WebSocket connection.
   */
  private _namespace: string;

  /**
   * Sends data to all connected clients.
   * @param {any} [data] - The data to send.
   */

  public in(data?: any) {
    this.server.to(this.namespace, data);
  }

  /**
   * Sends data to a specific namespace.
   *
   * @param {string} nameSpace - The namespace to send data to.
   * @param {any} [data] - The data to send.
   */
  public to(nameSpace: string, data?: any): void {
    if (typeof nameSpace !== 'string' && nameSpace) {
      throw new Error('Namespace must be a string');
    }

    let _nameSpace = nameSpace ? `${this.namespace}.${nameSpace}` : this.namespace;

    this.server.to(_nameSpace, data);
  }

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
   * @param _code - The close code sent by the server.
   * @param _reason - The reason for the connection closure.
   * @returns A promise that resolves to void or void.
   */
  protected onClose?(ws: Socket<T>, _code: number, _reason: string): void | Promise<void>;

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

  protected async onOpenInternal(ws: Socket<T>): Promise<void> {
    this.sockets.push({ id: ws.data.id, ws });

    ws.subscribe(`${ws.data.path}`);

    ws.subscribe(`${ws.data.path}.${ws.data.id}`);

    if (this.onOpen) {
      await this.onOpen(ws);
    }
  }

  protected async onCloseInternal(ws: Socket<T>, _code: number, _reason: string): Promise<void> {
    ws.unsubscribe(`${ws.data.path}`);

    ws.unsubscribe(`${ws.data.path}.${ws.data.id}`);

    this.sockets = this.sockets.filter((s) => s.id !== ws.data.id);

    if (this.onClose) {
      await this.onClose(ws, _code, _reason);
    }
  }

  public get sockets(): WebSocketWithId<any>[] {
    return this._sockets;
  }

  public set sockets(sockets: WebSocketWithId<any>[]) {
    this._sockets = sockets;
  }

  public get namespace(): string {
    return this._namespace;
  }

  public set namespace(value: string) {
    this._namespace = value;
  }

}
