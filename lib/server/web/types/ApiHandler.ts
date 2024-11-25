import type { HttpMethod } from '../http';
import type { MiddlewareClass, ValidatorClass } from '../../types';
import type { AsenaContext } from '../../../adapter';

export interface Route {
  [key: string]: ApiHandler;
}

export interface ApiHandler {
  path: string;
  method: HttpMethod;
  description: string;
  middlewares: MiddlewareClass[];
  staticServe: boolean;
  validator: ValidatorClass<any>;
}

export type apiMethod = (
  c: AsenaContext<any, any>,
  ...args: any[]
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => void | Promise<void> | Promise<Response> | Response ;

export interface ControllerDecoratorParams {
  path: string;
  middlewares?: MiddlewareClass[];
  description?: string;
  staticServe?: boolean;
  validator?: ValidatorClass<any>;
}
