import type { Middleware } from '../../types';
import { HttpMethod } from '../../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from '../helper';
import type { ApiHandler } from '../types';
import type { Context, TypedResponse } from 'hono';

// improve type check in here
export type apiMethod = (
  c: Context,
  ...args: any[]
) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse>;

// Todo: route system needs to be implemented
function genericHandler({ method, path, description, middlewares }: ApiHandler) {
  return function (route: any, propertyKey: string, descriptor: TypedPropertyDescriptor<apiMethod>) {
    const originalMethod = descriptor.value;

    // Todo : maybe we can validate the context request here
    descriptor.value = function (context: Context, ...args: any[]) {
      return originalMethod.apply(this, [context, ...args]);
    };

    const routes = getMetadata(RouteKey, route) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares };
    }

    defineMetadata(RouteKey, routes, route);
  };
}

interface ControllerDecoratorParams {
  path: string;
  middlewares?: Middleware[];
  description?: string;
}

export function Get(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.GET, path, middlewares, description });
}

export function Post(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.POST, path, middlewares, description });
}

export function Put(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PUT, path, middlewares, description });
}

export function Delete(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.DELETE, path, middlewares, description });
}

export function Patch(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PATCH, path, middlewares, description });
}

export function Options(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.OPTIONS, path, middlewares, description });
}

export function Head(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.HEAD, path, middlewares, description });
}

export function Connect(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.CONNECT, path, middlewares, description });
}

export function Trace(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.TRACE, path, middlewares, description });
}

const generateHandlerParams = (params: ControllerDecoratorParams | string): ControllerDecoratorParams => {
  return typeof params === 'string'
    ? { path: params, middlewares: [], description: '' }
    : { ...params, middlewares: params.middlewares || [], description: params.description || '' };
};
