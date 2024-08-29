import type { Middleware } from '../../types';
import { HttpMethod } from '../../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from '../helper';
import type { ApiHandler } from '../types';
import type { Context } from 'hono';

// improve type check in here
export type apiMethod = (c: Context, ...args: any[]) => any;

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

export function Get({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.GET, path, middlewares, description });
}

export function Post({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.POST, path, middlewares, description });
}

export function Put({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.PUT, path, middlewares, description });
}

export function Delete({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.DELETE, path, middlewares, description });
}

export function Patch({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.PATCH, path, middlewares, description });
}

export function Options({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.OPTIONS, path, middlewares, description });
}

export function Head({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.HEAD, path, middlewares, description });
}

export function Connect({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.CONNECT, path, middlewares, description });
}

export function Trace({ path, middlewares = [], description = '' }: ControllerDecoratorParams) {
  return genericHandler({ method: HttpMethod.TRACE, path, middlewares, description });
}
