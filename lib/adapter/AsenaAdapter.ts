import type { RouteParams } from './types';
import type { BaseMiddleware } from '../server/web/types';
import type { ValidatorClass } from '../server/types';

export abstract class AsenaAdapter<A = unknown, H = unknown, AM = unknown, AH = unknown, R = unknown, S = unknown> {

  public app: A;

  public abstract setPort(port: number): void;

  public abstract use(middleware: BaseMiddleware<R, S>): void;

  public abstract registerRoute(params: RouteParams<AM, AH>): void;

  public abstract prepareMiddlewares(middlewares: BaseMiddleware<R, S> | BaseMiddleware<R, S>[]): any[];

  public abstract prepareHandler(handler: H): any;

  public abstract start(): Promise<void>;

  public abstract onError(errorHandler: any): void;

  public abstract prepareValidator(validator: ValidatorClass<AM>): any;

}
