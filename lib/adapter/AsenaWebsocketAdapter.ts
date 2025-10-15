import type { AsenaWebSocketService, WSOptions } from '../server/web/websocket';
import type { WebSocketHandler } from 'bun';
import type { WebSocketRegistry } from './types';
import type { ServerLogger } from '../logger';

/**
 * Abstract class that provides a base implementation for WebSocket adapters.
 * Handles WebSocket connections, registration, and management.
 *
 * @template A - Type of the Adapter object
 */
export abstract class AsenaWebsocketAdapter {

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
  protected _websockets: WebSocketRegistry;

  /**
   * WebSocket handler instance for managing connections
   * @private
   */
  private _websocket: WebSocketHandler<any>;

  /**
   * Logger instance for WebSocket-related logging
   * @private
   */
  private _logger: ServerLogger = console;

  /**
   * Initializes a new WebSocket adapter instance
   * @param logger - Logger instance for WebSocket-related logging
   */
  protected constructor(logger: ServerLogger) {
    this._logger = logger;
  }

  /**
   * Registers a new WebSocket service with associated middlewares
   * @param websocket - WebSocket service instance to register
   */
  public abstract registerWebSocket(websocket: AsenaWebSocketService<any>): Promise<void> | void;

  /**
   * Configures and initializes the WebSocket server with provided options
   * @param wsOptions - Configuration options for the WebSocket server
   */
  public abstract prepareWebSocket(wsOptions?: WSOptions): Promise<void> | void;

  /**
   * Starts the WebSocket server on the provided HTTP/S server instance
   * @param server - HTTP/S server instance to attach the WebSocket server to
   */
  public abstract startWebsocket(server: any): Promise<void> | void;

  /**
   * Gets the WebSocket registry
   */
  protected get websockets(): WebSocketRegistry {
    return this._websockets;
  }

  /**
   * Sets the WebSocket registry
   */
  protected set websockets(value: WebSocketRegistry) {
    this._websockets = value;
  }

  /**
   * Gets the WebSocket handler
   */
  public get websocket(): WebSocketHandler<any> {
    return this._websocket;
  }

  /**
   * Sets the WebSocket handler
   */
  public set websocket(value: WebSocketHandler<any>) {
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
