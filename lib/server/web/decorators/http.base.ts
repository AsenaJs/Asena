import type { ApiParams, ControllerHandler, ControllerDecoratorParams, Route } from '../types';
import { ComponentConstants } from '../../../ioc/constants';
import { defineMiddleware } from '../helper';
import { defineTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';

export function genericHandler({ method, path, description, middlewares, staticServe, validator }: ApiParams) {
  return function (route: any, propertyKey: string, _descriptor: TypedPropertyDescriptor<ControllerHandler>) {
    const routes = getTypedMetadata<Route>(ComponentConstants.RouteKey, route) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares, staticServe, validator };
    }

    defineTypedMetadata<Route>(ComponentConstants.RouteKey, routes, route);

    defineMiddleware(route.constructor, middlewares);
  };
}

export const DEFAULT_PARAMS: ControllerDecoratorParams<any, any, any> = {
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
