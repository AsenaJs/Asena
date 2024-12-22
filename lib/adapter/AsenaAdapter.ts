import type { ErrorHandler, RouteParams } from './types';
import type { BaseMiddleware } from '../server/web/types';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from './AsenaWebsocketAdapter';
import type { ServerLogger } from '../logger';
import type { WSOptions } from '../server/web/websocket';
import type { AsenaServeOptions } from './types/ServeOptions';

/**
 * Abstract class representing an adapter for the Asena framework.
 * This adapter serves as a base interface between the framework and different server implementations.
 *
 * @template A - Type for the application instance (e.g., Express, Bun, etc.)
 * @template R - Type for the request object
 * @template S - Type for the response object
 * @template VS - Type for the validator schema
 * @template WSA - Type for the WebSocket adapter implementation
 */
export abstract class AsenaAdapter<A, R, S, VS, WSA extends AsenaWebsocketAdapter<A, R, S>> {

  /**
   * The name identifier of the adapter
   */
  public readonly name: string;

  /**
   * The main application instance
   */
  public app: A;

  /**
   * WebSocket adapter instance for handling real-time communications
   */
  public websocketAdapter: WSA;

  /**
   * Server port number
   */
  protected port: number;

  /**
   * Logger instance for server operations
   */
  protected logger: ServerLogger = console;

  /**
   * Creates a new adapter instance
   * @param websocketAdapter - WebSocket adapter implementation
   * @param logger - Optional custom logger implementation
   */
  protected constructor(websocketAdapter: WSA, logger?: ServerLogger) {
    this.websocketAdapter = websocketAdapter;
    if (logger) {
      this.logger = logger;

      if (!this.websocketAdapter.logger) {
        this.websocketAdapter.logger = logger;
      }
    }
  }

  /**
   * Configures the server port
   * @param port - Port number to listen on
   */
  public abstract setPort(port: number): void;

  /**
   * Registers middleware to the application
   * @param middleware - Middleware implementation
   * @param path - Optional path to apply the middleware to
   */
  public abstract use(middleware: BaseMiddleware<R, S>, path?: string): Promise<void> | void;

  /**
   * Registers a new route with the application
   * @param params - Route configuration parameters
   */
  public abstract registerRoute(params: RouteParams<R, S, VS>): Promise<void> | void;

  /**
   * Initializes and starts the server
   * @param wsOptions - Optional WebSocket configuration
   * @returns Server instance
   */
  public abstract start(wsOptions?: WSOptions): Promise<Server> | Server;

  /**
   * Sets up global error handling
   * @param errorHandler - Error handler implementation
   */
  public abstract onError(errorHandler: ErrorHandler<R, S>): Promise<void> | void;

  /**
   * Configures server options.
   *
   * @param options - Configuration options for the server, which can include:
   *   - `ServeOptions`: Basic server options.
   *   - `TLSServeOptions`: Options for TLS/SSL configuration.
   *   - `UnixServeOptions`: Options for Unix domain sockets.
   *   - `UnixTLSServeOptions`: Options for Unix domain sockets with TLS/SSL.
   * @returns A promise that resolves when the options are set, or void.
   */
  public abstract serveOptions(options: () => Promise<AsenaServeOptions> | AsenaServeOptions): Promise<void> | void;

}
