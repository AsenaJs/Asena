import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type {ControllerDecoratorParams} from "../../../../adapter";

/**
 * Decorator for handling HTTP POST requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the POST request.
 * @returns {Function} The generic handler for the POST request.
 */
export function Post(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.POST, path, middlewares, description, staticServe, validator });
}
