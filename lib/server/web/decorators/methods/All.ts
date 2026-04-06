import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling all HTTP methods on a route.
 * @param {ControllerDecoratorParams | string} params - The parameters for the route.
 * @returns {Function} The generic handler for all HTTP methods.
 */
export function All(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, summary, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.ALL, path, summary, middlewares, description, staticServe, validator });
}
