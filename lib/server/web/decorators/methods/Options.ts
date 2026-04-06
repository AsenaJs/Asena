import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling HTTP OPTIONS requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the OPTIONS request.
 * @returns {Function} The generic handler for the OPTIONS request.
 */
export function Options(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, summary, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.OPTIONS, path, summary, middlewares, description, staticServe, validator });
}
