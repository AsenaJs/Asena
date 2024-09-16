import type { HttpMethod } from '../http';
import type { MiddlewareClass } from '../../types';
import type { AsenaContext } from '../../../adapter';
import type { TypedResponse } from 'hono';
import type { ValidationService } from '../middleware';

export interface Route {
  [key: string]: ApiHandler;
}

export interface ApiHandler {
  path: string;
  method: HttpMethod;
  description: string;
  middlewares: MiddlewareClass[];
  staticServe: boolean;
  validator: ValidationService<any>;
}

export type apiMethod = (
  c: AsenaContext<any, any>,
  ...args: any[]
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => void | Promise<void> | Promise<Response | TypedResponse>;

export interface ControllerDecoratorParams {
  path: string;
  middlewares?: MiddlewareClass[];
  description?: string;
  staticServe?: boolean;
  validator?: ValidationService<any>;
}
