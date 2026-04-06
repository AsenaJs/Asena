import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling HTTP GET requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the GET request.
 * @returns {Function} The generic handler for the GET request.
 */
export function Get(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, summary, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.GET, path, summary, middlewares, description, staticServe, validator });
}
