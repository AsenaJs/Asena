import type { AsenaContext } from '../../../adapter';

/**
 * Abstract class representing a middleware service in the Asena framework.
 *
 * @template R - The request type.
 * @template S - The response type.
 */
export abstract class AsenaMiddlewareService<R, S> {

  /**
   * Handles the middleware logic.
   *
   * @param {AsenaContext<R, S>} context - The context for the middleware.
   * @param {Function} next - The next middleware function in the stack.
   * @returns {Promise<void> | any} A promise that resolves when the middleware is complete, or any other value.
   */
  public abstract handle(context: AsenaContext<R, S>, next: Function): Promise<void> | any;

}
