import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling HTTP PATCH requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the PATCH request.
 * @returns {Function} The generic handler for the PATCH request.
 */
export function Patch(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.PATCH, path, middlewares, description, staticServe, validator });
}
