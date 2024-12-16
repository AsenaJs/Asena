import type { ErrorHandler, RouteParams } from './types';
import type { BaseMiddleware } from '../server/web/types';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from './AsenaWebsocketAdapter';
import type { ServerLogger } from '../logger';
import type { WSOptions } from '../server/web/websocket';

/**
 * Abstract class representing an adapter for the Asena framework.
 *
 * @template A - Type for the application instance.
 * @template R - Type for the request.
 * @template S - Type for the response.
 * @template VS - Type for the validator schema.
 * @template WSA - Type for the WebSocket adapter.
 */
export abstract class AsenaAdapter<A, R, S, VS, WSA extends AsenaWebsocketAdapter<A, R, S>> {

  public readonly name: string;

  /**
   * The application instance.
   */
  public app: A;

  /**
   * The WebSocket adapter instance.
   */
  public websocketAdapter: WSA;

  /**
   * The port number.
   */
  protected port: number;

  /**
   * The logger instance.
   */
  protected logger: ServerLogger = console;

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
   * Sets the port number.
   *
   * @param {number} port - The port number to set.
   */
  public abstract setPort(port: number): void;

  /**
   * Uses a middleware.
   *
   * @param {BaseMiddleware<R, S>} middleware - The middleware to use.
   * @param path - The path to use the middleware on.
   */
  public abstract use(middleware: BaseMiddleware<R, S>, path?: string): Promise<void> | void;

  /**
   * Registers a route.
   *
   * @param {RouteParams<AM, AH>} params - The route parameters.
   */
  public abstract registerRoute(params: RouteParams<R, S, VS>): Promise<void> | void;

  /**
   * Starts the server.
   * @param {WSOptions} [wsOptions] - Optional WebSocket options.
   * @returns {Promise<Server>} A promise that resolves to the server instance.
   */
  public abstract start(wsOptions?: WSOptions): Promise<Server> | Server;

  /**
   * Sets an error handler.
   *
   * @param {ErrorHandler} errorHandler - The error handler to set.
   */
  public abstract onError(errorHandler: ErrorHandler<R, S>): Promise<void> | void;

}
