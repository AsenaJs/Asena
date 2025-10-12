import type { AsenaContext, AsenaServeOptions } from '../../adapter';

import type { MiddlewareClass } from '../web/middleware';

/**
 * Route configuration for global middleware
 */
export interface GlobalMiddlewareRouteConfig {
  /**
   * Paths to include. Supports glob patterns.
   * Default: ['*'] (all routes)
   *
   * @example
   * include: ['/api/*', '/admin/*']
   * include: ['/users/:id', '/posts/:id']
   */
  include?: string[];

  /**
   * Paths to exclude. Supports glob patterns.
   * Exclusions take precedence over inclusions.
   * Default: []
   *
   * @example
   * exclude: ['/health', '/metrics']
   * exclude: ['/api/public/*']
   */
  exclude?: string[];
}

/**
 * Global middleware configuration
 */
export interface GlobalMiddlewareConfig {
  /**
   * Middleware class to apply
   */
  middleware: MiddlewareClass;

  /**
   * Route configuration for this middleware
   * If not specified, middleware applies to all routes
   */
  routes?: GlobalMiddlewareRouteConfig;
}

/**
 * Union type for backward compatibility
 * - MiddlewareClass: Apply to all routes (old behavior)
 * - GlobalMiddlewareConfig: Apply with pattern matching (new behavior)
 */
export type GlobalMiddlewareEntry = MiddlewareClass | GlobalMiddlewareConfig;

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
   * Global middleware configuration for applying middleware across routes.
   *
   * Supports two formats:
   * 1. Simple: MiddlewareClass (applies to all routes)
   * 2. Advanced: GlobalMiddlewareConfig (pattern-based filtering)
   *
   * @example
   * ```typescript
   * // Simple format (backward compatible)
   * globalMiddlewares() {
   *   return [LoggerMiddleware, CorsMiddleware];
   * }
   *
   * // Advanced format with pattern matching
   * globalMiddlewares() {
   *   return [
   *     // Apply to all routes
   *     LoggerMiddleware,
   *
   *     // Apply only to /api/* and /admin/*
   *     {
   *       middleware: AuthMiddleware,
   *       routes: {
   *         include: ['/api/*', '/admin/*']
   *       }
   *     },
   *
   *     // Apply to all routes except /health
   *     {
   *       middleware: RateLimitMiddleware,
   *       routes: {
   *         exclude: ['/health', '/metrics']
   *       }
   *     },
   *
   *     // Advanced: include + exclude
   *     {
   *       middleware: AuditMiddleware,
   *       routes: {
   *         include: ['/api/*'],
   *         exclude: ['/api/health']
   *       }
   *     }
   *   ];
   * }
   * ```
   *
   * @returns Array of middleware configurations
   */
  globalMiddlewares?(): Promise<GlobalMiddlewareEntry[]> | GlobalMiddlewareEntry[];
}

export type AsenaConfigFunctions = 'onError' | 'serveOptions' | 'globalMiddlewares';
