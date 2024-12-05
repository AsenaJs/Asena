import type { ApiHandler, apiMethod, ControllerDecoratorParams, Route } from '../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../../ioc/constants';
import { defineMiddleware } from '../helper';

export function genericHandler({ method, path, description, middlewares, staticServe, validator }: ApiHandler) {
  return function (route: any, propertyKey: string, _descriptor: TypedPropertyDescriptor<apiMethod>) {
    const routes: Route = getMetadata(ComponentConstants.RouteKey, route) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares, staticServe, validator };
    }

    defineMetadata(ComponentConstants.RouteKey, routes, route);

    defineMiddleware(route.constructor, middlewares);
  };
}

export const DEFAULT_PARAMS: ControllerDecoratorParams = {
  path: '',
  middlewares: [],
  description: '',
  staticServe: false,
  validator: undefined,
};

export const generateHandlerParams = (params: ControllerDecoratorParams | string): ControllerDecoratorParams => {
  if (typeof params === 'string') {
    return {
      ...DEFAULT_PARAMS,
      path: normalizePathString(params),
    };
  }

  return {
    ...DEFAULT_PARAMS,
    ...params,
    path: normalizePathString(params.path),
  };
};

const normalizePathString = (path: string): string => path.replace(/^\/+/, '');
