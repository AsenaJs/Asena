import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling HTTP HEAD requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the HEAD request.
 * @returns {Function} The generic handler for the HEAD request.
 */
export function Head(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, summary, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.HEAD, path, summary, middlewares, description, staticServe, validator });
}
