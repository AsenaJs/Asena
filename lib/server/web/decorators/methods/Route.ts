import { generateHandlerParams, genericHandler } from '../http.base';
import type { HttpMethod } from '../../types';
import type { ControllerDecoratorParams } from '../../../../adapter';

/**
 * Decorator for handling custom HTTP methods.
 * Use this when standard decorators (@Get, @Post, etc.) don't cover your HTTP method.
 *
 * @param {string} method - The HTTP method (e.g., 'MYVERB', 'PURGE', 'LINK')
 * @param {ControllerDecoratorParams | string} params - Route path or full params object
 * @returns {Function} The generic handler for the custom method
 *
 * @example
 * ```typescript
 * @Controller('/api')
 * export class ApiController {
 *   @Route('PURGE', '/cache')
 *   async purgeCache(context: Context) {
 *     // Handle PURGE /api/cache
 *   }
 * }
 * ```
 */
export function Route(method: string, params: ControllerDecoratorParams | string = '/'): Function {
  const { path, middlewares, summary, description, staticServe, validator } = generateHandlerParams(params);

  return genericHandler({
    method: method.toLowerCase() as HttpMethod,
    path,
    summary,
    middlewares,
    description,
    staticServe,
    validator,
  });
}
