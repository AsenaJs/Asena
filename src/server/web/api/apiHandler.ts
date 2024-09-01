import { HttpMethod } from '../../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { RouteKey } from '../helper';
import type { ApiHandler, ControllerDecoratorParams } from '../types';
import type { Context, TypedResponse } from 'hono';
import { defineMiddleware } from '../helper/defineMiddleware';
import type { Validators } from '../types/validator';

// improve type check in here
export type apiMethod = (
  c: Context,
  ...args: any[]
) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse>;

function genericHandler({ method, path, description, middlewares, validator }: ApiHandler) {
  return function (route: any, propertyKey: string, _descriptor: TypedPropertyDescriptor<apiMethod>) {
    const routes = getMetadata(RouteKey, route) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares, validator };
    }

    defineMetadata(RouteKey, routes, route);

    defineMiddleware(route.constructor, middlewares);
  };
}

export function Get(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.GET });
}

export function Post(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.POST });
}

export function Put(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.PUT });
}

export function Delete(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.DELETE });
}

export function Patch(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.PATCH });
}

export function Options(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.OPTIONS });
}

export function Head(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.HEAD });
}

export function Connect(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.CONNECT });
}

export function Trace(params: ControllerDecoratorParams | string) {
  return genericHandler({ ...generateHandlerParams(params), method: HttpMethod.TRACE });
}

const generateHandlerParams = (params: ControllerDecoratorParams | string): ApiHandler => {
  return typeof params === 'string'
    ? { path: params, middlewares: [], description: '', validator: {} as Validators, method: null }
    : {
        ...params,
        method: null,
        middlewares: params.middlewares || [],
        description: params.description || '',
        validator: params.validator || ({} as Validators),
      };
};
