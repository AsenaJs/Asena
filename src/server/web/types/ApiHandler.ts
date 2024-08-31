import type { HttpMethod } from '../http/HttpMethod.ts';
import type { MiddlewareClass } from '../../types';

export interface Route {
  [key: string]: ApiHandler;
}

export interface ApiHandler {
  path: string;
  method: HttpMethod;
  description: string;
  middlewares: MiddlewareClass[];
}
