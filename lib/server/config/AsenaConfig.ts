import type { AsenaContext, AsenaServeOptions, NotFoundRequest } from '../../adapter';
import type { WebSocketTransport } from '../web/websocket';

import type { MiddlewareClass } from '../web/middleware';
import type { MessagingInterceptor } from '../microservice/types';
import type { MicroserviceTransport } from '../microservice/MicroserviceTransport';
import { DEFAULT_TRANSPORT_NAME } from '../microservice/types';

/**
 * Object form of the transport() hook - configures WebSocket and microservice
 * transports separately (all fields optional)
 */
export interface AsenaTransportConfig {
  /**
   * WebSocket transport for cross-pod messaging (same as the bare return form)
   */
  websocket?: WebSocketTransport | Promise<WebSocketTransport>;

  /**
   * Microservice transport(s). A single transport is registered under the
   * name 'default'; a named map allows multiple brokers in one project
   * (e.g. part on Redis, part on NATS).
   *
   * @example
   * microservice: new RedisMicroserviceTransport({ ... })
   * @example
   * microservice: { default: redisTransport, analytics: natsTransport }
   */
  microservice?:
    | MicroserviceTransport
    | Record<string, MicroserviceTransport>
    | Promise<MicroserviceTransport | Record<string, MicroserviceTransport>>;

  /**
   * Messaging interceptors applied to all microservice transports
   * (e.g. OpenTelemetry trace propagation)
   */
  interceptors?: MessagingInterceptor[];
}

/**
 * Normalized result of the transport() hook
 */
export interface NormalizedTransportConfig {
  websocket?: WebSocketTransport;
  microservices: Map<string, MicroserviceTransport>;
  interceptors: MessagingInterceptor[];
}

/**
 * Normalize the transport() hook result into a single shape.
 *
 * - A bare WebSocketTransport (has a publish function) is the legacy form → { websocket }
 * - An object form is discriminated per field; a single MicroserviceTransport
 *   (has a send function) becomes the 'default' named transport
 * - An object with none of the known fields throws (catches accidentally
 *   returning a bare MicroserviceTransport, which would otherwise be a silent no-op)
 *
 * CAVEAT: the legacy detection is duck-typed on `publish`. A custom
 * MicroserviceTransport that also defines a `publish` method would be
 * mistaken for a bare WebSocketTransport when returned bare - such
 * transports must use the explicit `{ microservice: ... }` object form.
 */
export async function normalizeTransportConfig(
  result: WebSocketTransport | AsenaTransportConfig,
): Promise<NormalizedTransportConfig> {
  // Legacy form: bare WebSocketTransport (publish is its only required member)
  if (typeof (result as WebSocketTransport).publish === 'function') {
    return { websocket: result as WebSocketTransport, microservices: new Map(), interceptors: [] };
  }

  const config = result as AsenaTransportConfig;

  if (config.websocket === undefined && config.microservice === undefined && config.interceptors === undefined) {
    throw new Error(
      'transport() returned an object without websocket/microservice/interceptors fields - return a WebSocketTransport or an AsenaTransportConfig object',
    );
  }

  const websocket = config.websocket ? await config.websocket : undefined;

  const microservices = new Map<string, MicroserviceTransport>();

  if (config.microservice) {
    const resolved = await config.microservice;

    if (typeof (resolved as MicroserviceTransport).send === 'function') {
      microservices.set(DEFAULT_TRANSPORT_NAME, resolved as MicroserviceTransport);
    } else {
      for (const [name, transport] of Object.entries(resolved as Record<string, MicroserviceTransport>)) {
        microservices.set(name, transport);
      }
    }
  }

  return { websocket, microservices, interceptors: config.interceptors || [] };
}

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
   * Answers a request that matched no route.
   *
   * Kept separate from {@link onError} on purpose: a missing route is a routing outcome, not
   * a thrown error, so `onError` never sees one and never has to discriminate. `request` is
   * normalised by the adapter, which is what lets the same body work on either adapter.
   *
   * When no handler is declared, both adapters answer `{ "error": "Not Found" }` with a 404.
   *
   * @param context - The current Asena context
   * @param request - The unmatched request's path and method
   * @returns Response object or a Promise that resolves to a Response
   *
   * @example
   * ```typescript
   * public onNotFound(context: Context, request: NotFoundRequest) {
   *   return context.send(
   *     { type: 'about:blank', title: 'Not Found', status: 404, instance: request.path },
   *     404,
   *   );
   * }
   * ```
   */
  onNotFound?(context: C, request: NotFoundRequest): Response | Promise<Response>;

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

  /**
   * Transport configuration for cross-pod WebSocket messaging and
   * microservice messaging.
   *
   * Two return forms are supported:
   * 1. Bare WebSocketTransport (legacy, backward compatible) - configures
   *    only the WebSocket transport. When not specified, BunLocalTransport
   *    is used (single-pod, zero overhead).
   * 2. AsenaTransportConfig object - configures WebSocket and microservice
   *    transports separately, plus messaging interceptors.
   *
   * @example
   * ```typescript
   * // Legacy form - WebSocket only
   * transport() {
   *   return new RedisTransport(this.redis);
   * }
   *
   * // Object form - WebSocket + microservice
   * transport() {
   *   return {
   *     websocket: new RedisTransport(this.redis),
   *     microservice: new RedisMicroserviceTransport({
   *       url: 'redis://localhost:6379',
   *       serviceName: 'order-service',
   *     }),
   *   };
   * }
   *
   * // Multiple named microservice transports (multi-broker projects)
   * transport() {
   *   return {
   *     microservice: {
   *       default: new RedisMicroserviceTransport({ ... }),
   *       analytics: new NatsMicroserviceTransport({ ... }),
   *     },
   *   };
   * }
   * ```
   */
  transport?(): WebSocketTransport | AsenaTransportConfig | Promise<WebSocketTransport | AsenaTransportConfig>;
}

export type AsenaConfigFunctions = 'onError' | 'onNotFound' | 'serveOptions' | 'globalMiddlewares' | 'transport';

/**
 * Every hook the framework reads off a @Config class. Anything else on the class is
 * ignored, so this list doubles as the allowlist used by the startup misuse check.
 */
export const ASENA_CONFIG_FUNCTIONS: readonly AsenaConfigFunctions[] = [
  'onError',
  'onNotFound',
  'serveOptions',
  'globalMiddlewares',
  'transport',
];

/**
 * Property names that look like a hook but are not one, mapped to the hook they were
 * probably meant to be.
 *
 * The type system cannot catch these - an extra property on a subclass is always legal -
 * yet the framework never reads them, so the configuration silently does nothing. The
 * startup check only fires when the value is an array, so an injected dependency that
 * happens to be named `middleware` is not mistaken for a misconfigured hook.
 */
export const ASENA_CONFIG_HOOK_ALIASES: Readonly<Record<string, AsenaConfigFunctions>> = {
  middlewares: 'globalMiddlewares',
  middleware: 'globalMiddlewares',
};
