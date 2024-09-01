import type { HttpMethod } from '../http/HttpMethod.ts';
import type { MiddlewareClass } from '../../types';
import type { Validators } from './validator';

export interface Route {
  [key: string]: ApiHandler;
}

export interface ApiHandler {
  path: string;
  method: HttpMethod;
  description: string;
  middlewares: MiddlewareClass[];
  validator: Validators;
}

export interface ControllerDecoratorParams {
  path: string;
  middlewares?: MiddlewareClass[];
  description?: string;
  validator?: Validators;
}
