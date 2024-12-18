import type { AsenaWebSocketService, WSOptions } from '../server/web/websocket';
import type { WebSocketHandler } from 'bun';
import type { ServerLogger } from '../services';
import type { WebsocketAdapterParams } from './types';
import type { WebSocketRegistry } from './types';

/**
 * Abstract class representing a WebSocket adapter.
 *
 * @template A - The type of the application.
 * @template AM - The type of the message.
 */
export abstract class AsenaWebsocketAdapter<A, MH> {

  /**
   * The WebSocket services.
   * @ string - The namespace of the WebSocket.
   * @ AsenaWebSocketService<any> - The WebSocket service.
   * @ MH[] - The middlewares to use.
   * @protected
   */
  protected _websockets: WebSocketRegistry;

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

  public get app(): A {
    return this._app;
  }

  public set app(value: A) {
    this._app = value;
  }

  protected get websockets(): WebSocketRegistry {
    return this._websockets;
  }

  protected set websockets(value: WebSocketRegistry) {
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
