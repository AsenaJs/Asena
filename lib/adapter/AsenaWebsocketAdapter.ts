import type { AsenaWebSocketService, WSOptions } from '../server/web/websocket';
import type { WebSocketHandler } from 'bun';
import type { WebsocketAdapterParams, WebSocketRegistry } from './types';
import type { ServerLogger } from '../logger';
import type { BaseMiddleware } from '../server/web/types';

// TODO: Update documents
/**
 * Abstract class representing a WebSocket adapter.
 *
 * @template A - The type of the application.
 * @template AM - The type of the message.
 */
export abstract class AsenaWebsocketAdapter<A, R, S> {

  /**
   * The WebSocket services.
   * @ string - The namespace of the WebSocket.
   * @ AsenaWebSocketService<any> - The WebSocket service.
   * @ MH[] - The middlewares to use.
   * @protected
   */
  protected _websockets: WebSocketRegistry<R, S>;

  /**
   * The application instance.
   * @private
   */
  private _app: A;

  /**
   * The WebSocket handler.
   * @private
   */
  private _websocket: WebSocketHandler;

  /**
   * The logger instance.
   */
  private _logger: ServerLogger = console;

  /**
   * Constructor for the AsenaWebSocketAdapter class.
   * @param params - The parameters for the constructor.
   */
  protected constructor(params?: WebsocketAdapterParams<A>) {
    this._app = params?.app;
    this._logger = params?.logger;
  }

  /**
   * Registers a WebSocket handler.
   *
   * @param {websocket<any>} websocket - The WebSocket to register.
   * @param middlewares to used in upgrade function
   */
  public abstract registerWebSocket(
    websocket: AsenaWebSocketService<any>,
    middlewares: BaseMiddleware<R, S>[],
  ): Promise<void> | void;

  /**
   * Build the WebSocket object for the server. Prepares the WebSocket with the given options.
   * @param {WSOptions} [wsOptions] - Optional WebSocket options.
   */
  public abstract buildWebsocket(wsOptions?: WSOptions): Promise<void> | void;

  /**
   * Start the WebSocket server.
   *
   * @param {Server} server - The server to start.
   */
  public abstract startWebsocket(server: any): Promise<void> | void;

  public get app(): A {
    return this._app;
  }

  public set app(value: A) {
    this._app = value;
  }

  protected get websockets(): WebSocketRegistry<R, S> {
    return this._websockets;
  }

  protected set websockets(value: WebSocketRegistry<R, S>) {
    this._websockets = value;
  }

  public get websocket(): WebSocketHandler {
    return this._websocket;
  }

  public set websocket(value: WebSocketHandler) {
    this._websocket = value;
  }

  public get logger(): ServerLogger {
    return this._logger;
  }

  public set logger(value: ServerLogger) {
    this._logger = value;
  }

}
