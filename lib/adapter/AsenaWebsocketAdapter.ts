import type { AsenaWebSocketService, WSOptions } from '../server/web/websocket';
import type { WebSocketHandler } from 'bun';
import type { WebsocketAdapterParams, WebSocketRegistry } from './types';
import type { ServerLogger } from '../logger';
import type { BaseMiddleware } from '../server/web/types';

/**
 * Abstract class that provides a base implementation for WebSocket adapters.
 * Handles WebSocket connections, registration, and management.
 *
 * @template A - Type of the application instance
 * @template R - Type of the request object
 * @template S - Type of the response object
 */
export abstract class AsenaWebsocketAdapter<A, R, S> {

  public readonly name: string;

  /**
   * Registry containing WebSocket services and their configurations
   * Structure:
   * - Key: WebSocket namespace
   * - Value: Object containing:
   *   - service: WebSocket service instance
   *   - middlewares: Array of middleware functions
   * @protected
   */
  protected _websockets: WebSocketRegistry<R, S>;

  /**
   * Reference to the main application instance
   * @private
   */
  private _app: A;

  /**
   * WebSocket handler instance for managing connections
   * @private
   */
  private _websocket: WebSocketHandler;

  /**
   * Logger instance for WebSocket-related logging
   * @private
   */
  private _logger: ServerLogger = console;

  /**
   * Initializes a new WebSocket adapter instance
   * @param params - Configuration parameters including app instance and logger
   */
  protected constructor(params?: WebsocketAdapterParams<A>) {
    this._app = params?.app;
    this._logger = params?.logger;
  }

  /**
   * Registers a new WebSocket service with associated middlewares
   * @param websocket - WebSocket service instance to register
   * @param middlewares - Array of middleware functions to be executed during connection upgrade
   */
  public abstract registerWebSocket(
    websocket: AsenaWebSocketService<any>,
    middlewares: BaseMiddleware<R, S>[],
  ): Promise<void> | void;

  /**
   * Configures and initializes the WebSocket server with provided options
   * @param wsOptions - Configuration options for the WebSocket server
   */
  public abstract buildWebsocket(wsOptions?: WSOptions): Promise<void> | void;

  /**
   * Starts the WebSocket server on the provided HTTP/S server instance
   * @param server - HTTP/S server instance to attach the WebSocket server to
   */
  public abstract startWebsocket(server: any): Promise<void> | void;

  // Getters and Setters with improved documentation

  /**
   * Gets the application instance
   */
  public get app(): A {
    return this._app;
  }

  /**
   * Sets the application instance
   */
  public set app(value: A) {
    this._app = value;
  }

  /**
   * Gets the WebSocket registry
   */
  protected get websockets(): WebSocketRegistry<R, S> {
    return this._websockets;
  }

  /**
   * Sets the WebSocket registry
   */
  protected set websockets(value: WebSocketRegistry<R, S>) {
    this._websockets = value;
  }

  /**
   * Gets the WebSocket handler
   */
  public get websocket(): WebSocketHandler {
    return this._websocket;
  }

  /**
   * Sets the WebSocket handler
   */
  public set websocket(value: WebSocketHandler) {
    this._websocket = value;
  }

  /**
   * Gets the logger instance
   */
  public get logger(): ServerLogger {
    return this._logger;
  }

  /**
   * Sets the logger instance
   */
  public set logger(value: ServerLogger) {
    this._logger = value;
  }

}
