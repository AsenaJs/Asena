import type { AsenaWebSocketService, WebSocketTransport, WSOptions, WebSocketData } from '../server/web/websocket';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
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
   * Optional WebSocket transport for cross-pod messaging.
   * When set, publish operations are routed through this transport.
   * @protected
   */
  protected _transport?: WebSocketTransport;

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

  /**
   * Gets the WebSocket transport
   */
  public get transport(): WebSocketTransport | undefined {
    return this._transport;
  }

  /**
   * Sets the WebSocket transport for cross-pod messaging
   */
  public set transport(value: WebSocketTransport | undefined) {
    this._transport = value;
  }

  // ── Heartbeat Infrastructure ──────────────────────────────────────────

  /**
   * Map of connection ID to heartbeat interval timer.
   * Used when sendPingStrategy is 'adapter'.
   */
  protected heartbeatIntervals: Map<string, Timer> = new Map();

  /**
   * Starts a periodic heartbeat (ping) for a WebSocket connection.
   * Call from the adapter's open handler when using 'adapter' strategy.
   *
   * @param ws - The WebSocket connection
   * @param intervalMs - Heartbeat interval in milliseconds (default: 30000)
   */
  protected startHeartbeat(ws: ServerWebSocket<WebSocketData>, intervalMs = 30000): void {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (error) {
          this.logger.error(`Heartbeat ping failed for connection ${ws.data.id}:`, error);
          this.stopHeartbeat(ws.data.id);

          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1011, 'Heartbeat failed');
          }
        }
      } else {
        this.stopHeartbeat(ws.data.id);
      }
    }, intervalMs);

    this.heartbeatIntervals.set(ws.data.id, interval);
  }

  /**
   * Stops the heartbeat for a single connection.
   * Call from the adapter's close handler.
   *
   * @param connectionId - The connection ID
   */
  protected stopHeartbeat(connectionId: string): void {
    const interval = this.heartbeatIntervals.get(connectionId);

    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(connectionId);
    }
  }

  /**
   * Clears all active heartbeat intervals.
   * Call during adapter shutdown.
   */
  protected clearAllHeartbeats(): void {
    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }

    this.heartbeatIntervals.clear();
  }
}
