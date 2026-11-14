import type {
  AsenaServeOptions,
  AsenaStartOptions,
  BaseMiddleware,
  ErrorHandler,
  NotFoundHandler,
  RouteParams,
  WebsocketRouteParams,
} from './types';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from './AsenaWebsocketAdapter';
import type { ServerLogger } from '../logger';
import type { AsenaContext } from './AsenaContext';
import type { GlobalMiddlewareRouteConfig } from '../server/config';
import type { DevtoolsScope } from '../devtools/DevtoolsScope';

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
  public readonly name!: string;

  /**
   * Server port number
   */
  protected port!: number;

  /**
   * Logger instance for server operations
   */
  protected logger: ServerLogger = console;

  /**
   * WebSocket adapter instance for handling real-time communications
   */
  protected websocketAdapter!: AsenaWebsocketAdapter;

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
   * Registers an HTML route for serving via Bun's native HTML import.
   * HTML routes bypass the middleware chain entirely and are served directly by Bun.serve().
   *
   * @param path - Full URL path (e.g., '/ui/home')
   * @param htmlBundle - The HTML bundle returned by importing an .html file
   * @param controllerName - Name of the FrontendController that owns this route
   * @param controllerBasePath - Base path of the FrontendController (e.g., '/ui')
   */
  public abstract registerHTMLRoute(
    path: string,
    htmlBundle: unknown,
    controllerName: string,
    controllerBasePath: string,
  ): void;

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
  public abstract start(options?: AsenaStartOptions): Promise<Server<any>> | Server<any>;

  /**
   * Sets up global error handling
   * @param errorHandler - Error handler implementation
   */
  public abstract onError(errorHandler: ErrorHandler<C>): Promise<void> | void;

  /**
   * Sets up handling for requests that match no route.
   *
   * Optional rather than abstract: an adapter that predates this hook still compiles, and
   * AsenaServer warns at start-up when a config declares `onNotFound()` but the adapter in use
   * cannot honour it - a silent no-op would be worse than a missing feature.
   *
   * @param notFoundHandler - Handler that produces the 404 response
   */
  public onNotFound?(notFoundHandler: NotFoundHandler<C>): Promise<void> | void;

  /**
   * Hands the adapter the server's devtools bus, so it can frame each HTTP request as a record for
   * `asena console`.
   *
   * Called at most once, only in a process `asena console` spawned (the devtools hook is set and
   * `process.send` exists), right after the adapter is resolved: before any `use()`,
   * `registerRoute()`, `onError()`, `onNotFound()` or `registerWebsocketRoute()` call, and before
   * `start()`. When it is never called the adapter must keep its request path exactly as it is: no
   * wrapper, no extra branch. Published cores before 0.13 never call it.
   *
   * Declare the bus as a local structural interface rather than importing this type; the members
   * an adapter may rely on are:
   * - `enabled: boolean` - true for as long as records are collected;
   * - `open(method, path)` - starts a record (method and pathname of the request);
   * - `run(record, fn)` - runs `fn` with `record` as the current record, so core's own steps
   *   (middlewares, validator, controller, `@Catch`, `@Config.onError`, `@NotFound`) land in it;
   * - `step(kind, name)` - appends a step to the current record;
   * - `close(record, status, answeredBy?)` - ends the record with the response status;
   *   `answeredBy` defaults to the last step.
   *
   * Core already records every handler it prepared. An adapter steps only what runs outside them,
   * with one of these kinds:
   * - `adapter-default` - the adapter's own error or 404 response, named after the adapter;
   * - `not-found` - a not-found answer core did not record (core records `@NotFound` and
   *   `@Config.onNotFound`);
   * - `validator` - a legacy `validator:` schema the adapter checks itself;
   * - `middleware` - a middleware call core's prepared chain did not record.
   *
   * @param bus - The devtools bus as this server sees it: a record opened through it is reported as this server's
   */
  public attachDevtools?(bus: Pick<DevtoolsScope, 'enabled' | 'open' | 'run' | 'step' | 'close'>): void;

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

  /**
   * Stops the server and releases resources.
   * @param closeActiveConnections - Whether to close active connections immediately
   */
  public abstract stop(closeActiveConnections?: boolean): Promise<void>;

  /**
   * Gets the WebSocket adapter for transport configuration
   */
  public getWebsocketAdapter(): AsenaWebsocketAdapter | undefined {
    return this.websocketAdapter;
  }
}
