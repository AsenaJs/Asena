import type { AsenaContext, AsenaServeOptions } from '../../adapter';
import type { AsenaMiddlewareService } from '../web/middleware';

/**
 * Configuration interface for Asena framework
 * @template C - Extends AsenaContext type with generic parameters
 */
export interface AsenaConfig<C extends AsenaContext<any, any> = AsenaContext<any, any>> {
  /**
   * Error handler function for the application
   * @param error - The error object that was thrown
   * @param context - The current Asena context
   * @returns Response object or a Promise that resolves to a Response
   */
  onError?(error: Error, context: C): Response | Promise<Response>;

  /**
   * Configuration options for the server
   * @returns AsenaServeOptions object containing server configuration
   */
  serveOptions?(): AsenaServeOptions;

  /**
   * Global middleware configuration for applying middleware across all routes.
   * Similar to Hono's global middleware usage:
   * @example
   * // Hono usage:
   * const app = new Hono()
   * app.use(middleware1)
   * app.use(middleware2)
   *
   * // Equivalent in Asena:
   * class Config implements AsenaConfig {
   *   globalMiddlewares() {
   *     return [
   *       MiddlewareService1,
   *       MiddlewareService2
   *     ]
   *   }
   * }
   *
   * @returns Array of middleware services to be applied globally
   */
  globalMiddlewares?(): AsenaMiddlewareService<C>[];
}

export const AsenaConfigFunctions = 'onError, serveOptions';
