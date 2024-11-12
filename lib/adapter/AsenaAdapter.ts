import type { RouteParams } from './types';
import type { BaseMiddleware } from '../server/web/types';
import type { ValidatorClass } from '../server/types';
import type { Server } from 'bun';
import type { AsenaWebsocketAdapter } from './AsenaWebsocketAdapter';

/**
 * Abstract class representing an adapter for the Asena framework.
 *
 * @template A - Type for the application instance.
 * @template H - Type for the handler.
 * @template AM - Type for the middleware.
 * @template AH - Type for the handler.
 * @template R - Type for the request.
 * @template S - Type for the response.
 * @template WSA - Type for the WebSocket adapter.
 */
export abstract class AsenaAdapter<
  A = unknown,
  H = unknown,
  AM = unknown,
  AH = unknown,
  R = unknown,
  S = unknown,
  WSA extends AsenaWebsocketAdapter<A, AM> = AsenaWebsocketAdapter<A, AM>,
> {

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
  public abstract use(middleware: BaseMiddleware<R, S>, path?: string): void;

  /**
   * Registers a route.
   *
   * @param {RouteParams<AM, AH>} params - The route parameters.
   */
  public abstract registerRoute(params: RouteParams<AM, AH>): void;

  /**
   * Prepares middlewares.
   *
   * @param {BaseMiddleware<R, S> | BaseMiddleware<R, S>[]} middlewares - The middlewares to prepare.
   * @returns {any[]} The prepared middlewares.
   */
  public abstract prepareMiddlewares(middlewares: BaseMiddleware<R, S> | BaseMiddleware<R, S>[]): any[];

  /**
   * Prepares a handler.
   *
   * @param {H} handler - The handler to prepare.
   * @returns {any} The prepared handler.
   */
  public abstract prepareHandler(handler: H): any;

  /**
   * Starts the server.
   *
   * @returns {Promise<Server>} A promise that resolves to the server instance.
   */
  public abstract start(): Promise<Server>;

  /**
   * Sets an error handler.
   *
   * @param {any} errorHandler - The error handler to set.
   */
  public abstract onError(errorHandler: any): void;

  /**
   * Prepares a validator.
   *
   * @param {ValidatorClass<AM>} validator - The validator to prepare.
   * @returns {any} The prepared validator.
   */
  public abstract prepareValidator(validator: ValidatorClass<AM>): any;

}
