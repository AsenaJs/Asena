import type { ControllerDecoratorParams } from '../../types';
import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../http';

/**
 * Decorator for handling HTTP CONNECT requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the CONNECT request.
 * @returns {Function} The generic handler for the CONNECT request.
 */
export function Connect(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.CONNECT, path, middlewares, description, staticServe, validator });
}
