import type { AsenaContext, AsenaNextHandler } from '../../../adapter';
import type { Class } from '../../types';

/**
 * Abstract class representing a middleware service in the Asena framework.
 *
 * @template C - The context type, extending AsenaContext.
 */
export abstract class AsenaMiddlewareService<C extends AsenaContext<any, any> = any> {

  /**
   * Handles the middleware logic.
   *
   * @param {C} context - The context for the middleware.
   * @param {AsenaNextHandler} next - The next middleware function in the stack.
   * @returns {Promise<void> | any} A promise that resolves when the middleware is complete, or any other value.
   */
  public abstract handle(context: C, next: AsenaNextHandler): Promise<void> | any;

}

export type MiddlewareClass<C extends AsenaContext<any, any> = AsenaContext<any, any>> = Class<
  AsenaMiddlewareService<C>
>;