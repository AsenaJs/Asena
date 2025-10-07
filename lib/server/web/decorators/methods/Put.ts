import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling HTTP PUT requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the PUT request.
 * @returns {Function} The generic handler for the PUT request.
 */
export function Put(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PUT, path, middlewares, description, staticServe, validator });
}
