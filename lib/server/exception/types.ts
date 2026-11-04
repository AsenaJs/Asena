import type { AsenaContext } from '../../adapter/AsenaContext';
import type { MessageContext } from '../microservice/MicroserviceTransport';

/**
 * An error class, as passed to `@Catch`.
 *
 * `abstract new` rather than `new` so an abstract domain base - `abstract class DomainError
 * extends Error` - can be caught. Only a subclass is ever constructed, so the abstract base is
 * exactly the kind of thing a handler wants to match on.
 */
export type ExceptionType = abstract new (...args: any[]) => any;

/**
 * What `@Catch` records on the class, keyed by method name.
 *
 * `types` empty means catch-all. Kept as a record (not a list) so `getChainedTypedMetadata` can
 * merge it across a prototype chain, letting a subclass override an inherited handler *by method
 * name* while keeping the rest.
 */
export interface CatchHandlerMetadata {
  methodName: string;
  /** Empty for a bare `@Catch()`. */
  types: ExceptionType[];
}

/**
 * What `@NotFound` records on the class, keyed by method name.
 *
 * A record for the same reason as {@link CatchHandlerMetadata}: it merges across a prototype
 * chain, and two entries - whether on one class or two - are what the boot check counts.
 */
export interface NotFoundHandlerMetadata {
  methodName: string;
}

/**
 * The scope an error was raised in.
 *
 * A discriminant rather than three separate decorators: one `@Catch(DbConnectionError)` should
 * cover that failure wherever it surfaces, and `if (ctx.scope !== 'http') return;` narrows in one
 * line. Note the framework's own transports are the only producers - applications never build one.
 */
export type ExceptionScope = 'http' | 'event' | 'microservice';

/** An error raised while handling an HTTP request - a controller, a middleware or a validator. */
export interface HttpExceptionContext<C extends AsenaContext<any, any> = AsenaContext<any, any>> {
  readonly scope: 'http';
  /** The adapter's request context: `send()`, `req`, headers, `routePattern`. */
  readonly context: C;
}

/**
 * An error raised by an in-process `@On` handler, dispatched through `EventDispatchService`.
 * Observe-only: the default error line is logged regardless, and a returned value is ignored with a warning.
 */
export interface EventExceptionContext {
  readonly scope: 'event';
  /** The dispatched event name, e.g. `user.created`. */
  readonly event: string;
  readonly data: unknown;
  /**
   * `UserEventService.handleCreated`. Absent for handlers registered imperatively through the
   * emitter rather than by `@On`, where there is no class or method to name.
   */
  readonly source?: string;
}

/** An error raised by a `@MessagePattern` or `@EventPattern` handler. */
export interface MicroserviceExceptionContext {
  readonly scope: 'microservice';
  /**
   * `message` is request/response - a handler's return value other than `undefined` becomes a
   * successful reply; `undefined` lets the caller see the failure, and a `Response` is declined with
   * a warning. `event` is observe-only: the original failure always reaches the transport, so its
   * retry / DLQ policy applies, and a returned value is ignored with a warning.
   */
  readonly kind: 'message' | 'event';
  readonly message: MessageContext;
  readonly data: unknown;
  /** `OrderHandler.create` */
  readonly source: string;
  /** The configured transport name, e.g. `default`. */
  readonly transport: string;
}

/**
 * What a `@Catch` method receives as its second argument.
 *
 * @example
 * ```typescript
 * @Catch(DbConnectionError)
 * public db(error: DbConnectionError, ctx: ExceptionContext<Context>) {
 *   this.alerts.page(error);
 *   if (ctx.scope !== 'http') return;          // messages: the original error; events: observed only
 *   return ctx.context.send({ error: 'Service Unavailable' }, 503);
 * }
 * ```
 */
export type ExceptionContext<C extends AsenaContext<any, any> = AsenaContext<any, any>> =
  HttpExceptionContext<C> | EventExceptionContext | MicroserviceExceptionContext;

/**
 * A `@Catch` method, bound to its instance and paired with where it was declared.
 *
 * `source` is carried for the sake of diagnostics - the duplicate-detection errors and the
 * catch-all boot notice both name the declaring method, and by the time they are raised the
 * function alone can no longer say where it came from.
 */
export interface CatchEntry {
  handler: (error: unknown, context: ExceptionContext<any>) => unknown;
  /** `ApiExceptionHandler.fallback` */
  source: string;
}
