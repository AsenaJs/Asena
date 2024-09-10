import { HttpMethod } from '../../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from '../helper';
import type { ApiHandler, apiMethod, ControllerDecoratorParams, Route } from '../types';
import { defineMiddleware } from '../helper/defineMiddleware.ts';

// Todo: route system needs to be implemented
function genericHandler({ method, path, description, middlewares, staticServe }: ApiHandler) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return function (route: any, propertyKey: string, _descriptor: TypedPropertyDescriptor<apiMethod>) {
    const routes: Route = getMetadata(RouteKey, route) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares, staticServe };
    }

    defineMetadata(RouteKey, routes, route);

    defineMiddleware(route.constructor, middlewares);
  };
}

export function Get(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.GET, path, middlewares, description, staticServe });
}

export function Post(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.POST, path, middlewares, description, staticServe });
}

export function Put(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PUT, path, middlewares, description, staticServe });
}

export function Delete(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.DELETE, path, middlewares, description, staticServe });
}

export function Patch(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PATCH, path, middlewares, description, staticServe });
}

export function Options(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.OPTIONS, path, middlewares, description, staticServe });
}

export function Head(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.HEAD, path, middlewares, description, staticServe });
}

export function Connect(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.CONNECT, path, middlewares, description, staticServe });
}

export function Trace(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.TRACE, path, middlewares, description, staticServe });
}

const generateHandlerParams = (params: ControllerDecoratorParams | string): ControllerDecoratorParams => {
  return typeof params === 'string'
    ? { path: params, middlewares: [], description: '' }
    : {
        ...params,
        middlewares: params.middlewares || [],
        description: params.description || '',
        staticServe: params.staticServe || false,
      };
};
