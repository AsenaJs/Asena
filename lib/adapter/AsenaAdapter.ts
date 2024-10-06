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

  public app: A;

  public websocketAdapter: WSA;

  protected port: number;

  public abstract setPort(port: number): void;

  public abstract use(middleware: BaseMiddleware<R, S>): void;

  public abstract registerRoute(params: RouteParams<AM, AH>): void;

  public abstract prepareMiddlewares(middlewares: BaseMiddleware<R, S> | BaseMiddleware<R, S>[]): any[];

  public abstract prepareHandler(handler: H): any;

  public abstract start(): Promise<Server>;

  public abstract onError(errorHandler: any): void;

  public abstract prepareValidator(validator: ValidatorClass<AM>): any;

}
