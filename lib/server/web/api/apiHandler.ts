import { HttpMethod } from '../http';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import type { ApiHandler, apiMethod, ControllerDecoratorParams, Route } from '../types';
import { defineMiddleware } from '../helper';
import { ComponentConstants } from '../../../ioc/constants';

function genericHandler({ method, path, description, middlewares, staticServe, validator }: ApiHandler) {
  return function (route: any, propertyKey: string, _descriptor: TypedPropertyDescriptor<apiMethod>) {
    const routes: Route = getMetadata(ComponentConstants.RouteKey, route) || {};

    if (!routes[propertyKey]) {
      routes[propertyKey] = { path, method, description, middlewares, staticServe, validator };
    }

    defineMetadata(ComponentConstants.RouteKey, routes, route);

    defineMiddleware(route.constructor, middlewares);
  };
}

/**
 * Decorator for handling HTTP GET requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the GET request.
 * @returns {Function} The generic handler for the GET request.
 */
export function Get(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.GET, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP POST requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the POST request.
 * @returns {Function} The generic handler for the POST request.
 */
export function Post(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.POST, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP PUT requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the PUT request.
 * @returns {Function} The generic handler for the PUT request.
 */
export function Put(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PUT, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP DELETE requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the DELETE request.
 * @returns {Function} The generic handler for the DELETE request.
 */
export function Delete(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.DELETE, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP PATCH requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the PATCH request.
 * @returns {Function} The generic handler for the PATCH request.
 */
export function Patch(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PATCH, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP OPTIONS requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the OPTIONS request.
 * @returns {Function} The generic handler for the OPTIONS request.
 */
export function Options(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.OPTIONS, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP HEAD requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the HEAD request.
 * @returns {Function} The generic handler for the HEAD request.
 */
export function Head(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.HEAD, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP CONNECT requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the CONNECT request.
 * @returns {Function} The generic handler for the CONNECT request.
 */
export function Connect(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.CONNECT, path, middlewares, description, staticServe, validator });
}

/**
 * Decorator for handling HTTP TRACE requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the TRACE request.
 * @returns {Function} The generic handler for the TRACE request.
 */
export function Trace(params: ControllerDecoratorParams | string) {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.TRACE, path, middlewares, description, staticServe, validator });
}

const generateHandlerParams = (params: ControllerDecoratorParams | string): ControllerDecoratorParams => {
  return typeof params === 'string'
    ? { path: params.replace(/^\/+/, ''), middlewares: [], description: '', staticServe: false, validator: undefined }
    : {
        path: params.path.replace(/^\/+/, ''),
        middlewares: params.middlewares || [],
        description: params.description || '',
        staticServe: params.staticServe || false,
        validator: params.validator || undefined,
      };
};
