import type { HttpMethod } from '../http/HttpMethod.ts';
import type { MiddlewareClass } from '../../types';
import type { AsenaContext } from '../../../adapter';
import type { TypedResponse } from 'hono';

export interface Route {
  [key: string]: ApiHandler;
}

export interface ApiHandler {
  path: string;
  method: HttpMethod;
  description: string;
  middlewares: MiddlewareClass[];
  staticServe: boolean;
}

export type apiMethod = (
  c: AsenaContext<any, any>,
  ...args: any[]
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse> | void | Promise<void>;

export interface ControllerDecoratorParams {
  path: string;
  middlewares?: MiddlewareClass[];
  description?: string;
  staticServe?: boolean;
}
