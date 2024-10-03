import type { RouteParams } from './types';
import type { BaseMiddleware } from '../server/web/types';
import type { ValidatorClass } from '../server/types';
import type { WebSocketHandlerWithPath, WSOptions } from '../server/web/websocket';
import type { Server, WebSocketHandler } from 'bun';

export abstract class AsenaAdapter<A = unknown, H = unknown, AM = unknown, AH = unknown, R = unknown, S = unknown> {

  public app: A;

  protected port: number;

  // Todo: this implementation of websocket is not correct. it is not open to be extended
  protected websocket: WebSocketHandler;

  protected websocketHandlers: WebSocketHandlerWithPath<AM>[];

  public abstract setPort(port: number): void;

  public abstract use(middleware: BaseMiddleware<R, S>): void;

  public abstract registerRoute(params: RouteParams<AM, AH>): void;

  public abstract prepareMiddlewares(middlewares: BaseMiddleware<R, S> | BaseMiddleware<R, S>[]): any[];

  public abstract prepareHandler(handler: H): any;

  public abstract start(): Promise<Server>;

  public abstract onError(errorHandler: any): void;

  public abstract prepareValidator(validator: ValidatorClass<AM>): any;

  public abstract registerWebSocketHandler(websocketHandlers: WebSocketHandlerWithPath<AM>): void;

  public abstract prepareWebSocket(wsOptions?: WSOptions): void;

}
