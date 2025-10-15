import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling HTTP TRACE requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the TRACE request.
 * @returns {Function} The generic handler for the TRACE request.
 */
export function Trace(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.TRACE, path, middlewares, description, staticServe, validator });
}
