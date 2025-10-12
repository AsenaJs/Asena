import type { AsenaServeOptions, BaseMiddleware, ErrorHandler, RouteParams, WebsocketRouteParams } from './types';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from './AsenaWebsocketAdapter';
import type { ServerLogger } from '../logger';
import type { AsenaContext } from './AsenaContext';
import type { GlobalMiddlewareRouteConfig } from '../server/config';

/**
 * Abstract class representing an adapter for the Asena framework.
 * This adapter serves as a base interface between the framework and different server implementations.
 *
 * @template C - Type for the context object
 * @template VS - Type for the validator schema
 */
export abstract class AsenaAdapter<C extends AsenaContext<any, any>, VS> {

  /**
   * The name identifier of the adapter
   */
  public readonly name: string;

  /**
   * Server port number
   */
  protected port: number;

  /**
   * Logger instance for server operations
   */
  protected logger: ServerLogger = console;

  /**
   * WebSocket adapter instance for handling real-time communications
   */
  protected websocketAdapter: AsenaWebsocketAdapter;

  /**
   * Creates a new adapter instance
   * @param websocketAdapter - WebSocket adapter implementation
   * @param logger - Optional custom logger implementation
   */
  protected constructor(logger: ServerLogger, websocketAdapter?: AsenaWebsocketAdapter) {
    this.logger = logger;

    if (websocketAdapter) {
      this.websocketAdapter = websocketAdapter;
    }
  }

  /**
   * Configures the server port
   * @param port - Port number to listen on
   */
  public abstract setPort(port: number): void;

  /**
   * Registers middleware to the application
   *
   * @param middleware - Middleware implementation
   * @param config - Optional route configuration for pattern matching
   *
   * @example
   * ```typescript
   * // Old API (still supported)
   * adapter.use(middleware);
   *
   * // New API with pattern matching
   * adapter.use(middleware, {
   *   routes: {
   *     include: ['/api/*'],
   *     exclude: ['/api/health']
   *   }
   * });
   * ```
   */
  public abstract use(middleware: BaseMiddleware<C>, config?: GlobalMiddlewareRouteConfig): Promise<void> | void;

  /**
   * Registers a new route with the application
   * @param params - Route configuration parameters
   */
  public abstract registerRoute(params: RouteParams<C, VS>): Promise<void> | void;

  /**
   * Registers a WebSocket route with the application. This method establishes the connection
   * between HTTP routes and WebSocket handlers, allowing the adapter to properly route
   * WebSocket connection requests to the appropriate handlers.
   *
   * @param {WebsocketRouteParams<C>} params - Configuration parameters for the WebSocket route,
   *                                          including path, handlers, and middleware
   * @returns {Promise<void> | void} - Promise that resolves when registration is complete
   */
  public abstract registerWebsocketRoute(params: WebsocketRouteParams<C>): Promise<void> | void;

  /**
   * Initializes and starts the server
   * @returns Server instance
   */
  public abstract start(): Promise<Server> | Server;

  /**
   * Sets up global error handling
   * @param errorHandler - Error handler implementation
   */
  public abstract onError(errorHandler: ErrorHandler<C>): Promise<void> | void;

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
