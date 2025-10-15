import { ComponentConstants } from '../../../ioc/constants';
import { defineMiddleware } from '../helper';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils/typedMetadata';
import type { ApiParams, ControllerDecoratorParams, ControllerHandler, Route } from '../../../adapter';

export function genericHandler({ method, path, description, middlewares, staticServe, validator }: ApiParams) {
  return function (route: Object, propertyKey: string, _descriptor: TypedPropertyDescriptor<ControllerHandler>) {
    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, route.constructor) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares, staticServe, validator };
    }

    defineTypedMetadata<Route>(ComponentConstants.RouteKey, routes, route.constructor);

    defineMiddleware(route.constructor, middlewares);
  };
}

export const DEFAULT_PARAMS: ControllerDecoratorParams = {
  path: '',
  middlewares: [],
  description: '',
  staticServe: undefined,
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
