import type { WebSocketHandlerWithPath, WSOptions } from '../server/web/websocket';

/**
 * Abstract class representing a WebSocket adapter.
 *
 * @template A - The type of the application.
 * @template AM - The type of the message.
 */
export abstract class AsenaWebsocketAdapter<A, AM> {

  public app: A;

  protected websocketHandlers: WebSocketHandlerWithPath<AM>[];

  /**
   * Registers a WebSocket handler.
   *
   * @param {WebSocketHandlerWithPath<AM>} websocketHandlers - The WebSocket handler to register.
   */
  public abstract registerWebSocketHandler(websocketHandlers: WebSocketHandlerWithPath<AM>): void;

  /**
   * Prepares the WebSocket with the given options.
   *
   * @param {WSOptions} [wsOptions] - Optional WebSocket options.
   */
  public abstract prepareWebSocket(wsOptions?: WSOptions): void;

  /**
   * Starts the WebSocket.
   */
  public abstract startWebSocket(): void;

}
