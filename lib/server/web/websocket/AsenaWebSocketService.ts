import type { AsenaWebSocketServer } from './AsenaWebSocketServer';
import type { Socket } from './AsenaSocket';

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
   * A map to store the WebSocket connections.
   */
  private _sockets: Map<string, Socket<T>> = new Map<string, Socket<T>>();

  /**
   * A map to store the rooms.
   */
  private _rooms: Map<string, Socket<T>[]> = new Map<string, Socket<T>[]>();

  /**
   * The namespace for the WebSocket connection.
   */
  private _namespace: string;

  /**
   * Sends data to all connected clients.
   * @param {any} [data] - The data to send.
   */

  public in(data?: any) {
    this.to(this.namespace, data);
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
   * Retrieves the sockets associated with a specific room.
   *
   * @param {string} room - The name of the room.
   * @returns {Socket<T>[]} - An array of sockets in the specified room.
   */
  public getSocketsByRoom(room: string): Socket<T>[] {
    return this.rooms.get(room);
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
    this.sockets.set(ws.id, ws);

    ws.subscribe('');

    ws.subscribe(`${ws.data.id}`);

    if (this.onOpen) {
      await this.onOpen(ws);
    }
  }

  protected async onCloseInternal(ws: Socket<T>, _code: number, _reason: string): Promise<void> {
    ws.cleanup();

    ws.unsubscribe(``);

    ws.unsubscribe(`.${ws.data.id}`);

    this.sockets.delete(ws.id);

    if (this.onClose) {
      await this.onClose(ws, _code, _reason);
    }
  }

  public get sockets(): Map<string, Socket<T>> {
    return this._sockets;
  }

  public set sockets(sockets: Map<string, Socket<T>>) {
    this._sockets = sockets;
  }

  public get namespace(): string {
    return this._namespace;
  }

  public set namespace(value: string) {
    this._namespace = value;
  }

  public get rooms(): Map<string, Socket<T>[]> {
    return this._rooms;
  }

  public set rooms(value: Map<string, Socket<T>[]>) {
    this._rooms = value;
  }

}
