import type { RouteParams } from './types';
import type { BaseMiddleware, BaseValidator } from '../server/web/types';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from './AsenaWebsocketAdapter';
import type { ServerLogger } from '../logger';
import type { ErrorHandler } from './types';

/**
 * Abstract class representing an adapter for the Asena framework.
 *
 * @template A - Type for the application instance.
 * @template H - Type for Asena controller handler.
 * @template AM - Type for the application middlewareHandler.
 * @template AH - Type for the application(hono or elysia... etc.) handler.
 * @template R - Type for the request.
 * @template S - Type for the response.
 * @template VS - Type for the validator schema.
 * @template WSA - Type for the WebSocket adapter.
 */
export abstract class AsenaAdapter<A, H, AM, AH, R, S, VS, WSA extends AsenaWebsocketAdapter<A, AM>> {

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
  public abstract registerRoute(params: RouteParams<AM, AH>): Promise<void> | void;

  /**
   * Prepares middlewares.
   *
   * @param {BaseMiddleware<R, S> | BaseMiddleware<R, S>[]} middlewares - The middlewares to prepare.
   * @returns {any[]} The prepared middlewares.
   */
  public abstract prepareMiddlewares(
    middlewares: BaseMiddleware<R, S> | BaseMiddleware<R, S>[],
  ): Promise<any[] | any> | (any[] | any);

  /**
   * Prepares a handler.
   *
   * @param {H} handler - The handler to prepare.
   * @returns {any} The prepared handler.
   */
  public abstract prepareHandler(handler: H): Promise<any> | any;

  /**
   * Starts the server.
   *
   * @returns {Promise<Server>} A promise that resolves to the server instance.
   */
  public abstract start(): Promise<Server> | Server;

  /**
   * Sets an error handler.
   *
   * @param {ErrorHandler} errorHandler - The error handler to set.
   */
  public abstract onError(errorHandler: ErrorHandler<R, S>): Promise<void> | void;

  /**
   * Prepares a validator.
   *
   * @param {BaseValidator} validator - The validator to prepare.
   * @returns {any} The prepared validator.
   */
  public abstract prepareValidator(validator: BaseValidator<VS>): Promise<any> | any;

}
