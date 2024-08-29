import type { HttpMethod } from '../http/HttpMethod.ts';
import type { Middleware } from '../../types/Middleware';

export interface Route {
  [key: string]: ApiHandler;
}

export interface ApiHandler {
  path: string;
  method: HttpMethod;
  description: string;
  middlewares: Middleware[];
}