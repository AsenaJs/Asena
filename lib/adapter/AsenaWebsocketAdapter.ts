import type { AsenaWebSocketService, WSOptions } from '../server/web/websocket';

/**
 * Abstract class representing a WebSocket adapter.
 *
 * @template A - The type of the application.
 * @template AM - The type of the message.
 */
export abstract class AsenaWebsocketAdapter<A, MH> {

  public app: A;

  protected websockets: { socket: AsenaWebSocketService<any>; middlewares: MH[] }[];

  /**
   * Registers a WebSocket handler.
   *
   * @param {websocket<any>} websocket - The WebSocket to register.
   * @param middlewares to used in upgrade function
   */
  public abstract registerWebSocket(websocket: AsenaWebSocketService<any>, middlewares: MH[]): void;

  /**
   * Prepares the WebSocket with the given options.
   *
   * @param {WSOptions} [wsOptions] - Optional WebSocket options.
   */
  public abstract prepareWebSocket(wsOptions?: WSOptions): void;

  /**
   * Build the WebSocket object for the server.
   */
  public abstract buildWebsocket(): void;

  /**
   * Start the WebSocket server.
   *
   * @param {Server} server - The server to start.
   */
  public abstract startWebsocket(server: any): void;

}
