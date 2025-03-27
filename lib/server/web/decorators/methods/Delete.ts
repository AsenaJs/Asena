import { generateHandlerParams, genericHandler } from '../http.base';
import { HttpMethod } from '../../types';
import type {ControllerDecoratorParams} from "../../../../adapter";

/**
 * Decorator for handling HTTP DELETE requests.
 * @param {ControllerDecoratorParams | string} params - The parameters for the DELETE request.
 * @returns {Function} The generic handler for the DELETE request.
 */
export function Delete(params: ControllerDecoratorParams | string): Function {
  const { path, middlewares, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({ method: HttpMethod.DELETE, path, middlewares, description, staticServe, validator });
}
