import type { Container, ICoreService } from '../../../ioc';
import { ComponentConstants, ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';
import { getChainedTypedMetadata, getOwnTypedMetadata } from '../../../utils';
import { type ServerLogger, yellow } from '../../../logger';
import { ExceptionRegistry, type ExceptionRegistryView } from '../../exception/ExceptionRegistry';
import type {
  CatchEntry,
  CatchHandlerMetadata,
  ExceptionContext,
  ExceptionType,
  MicroserviceExceptionContext,
  NotFoundHandlerMetadata,
} from '../../exception/types';
import type { NotFoundRequest } from '../../../adapter/types/ErrorHandler';
import { devtoolsBus } from '../../../devtools/DevtoolsBus';
import { HttpException } from '../../../adapter/types/HttpException';

/** A resolved `@NotFound()` method, with where it came from for the cardinality error. */
interface NotFoundEntry {
  handler: (context: any, request: NotFoundRequest) => unknown;
  source: string;
}

/**
 * @description PrepareExceptionHandlerService - Builds the exception handling table at boot
 *
 * Scan process:
 * 1. Resolve every ComponentType.EXCEPTION_HANDLER from the container
 * 2. Read the chained `@Catch` / `@NotFound` metadata off each class
 * 3. Reject duplicates - one exception type, one handler, application-wide
 * 4. Bind each method to its instance and register it in the {@link ExceptionRegistry}
 *
 * Everything it rejects, it rejects **here**, during APPLICATION_SETUP - before the adapter binds
 * a port. A misconfiguration that only shows up on the first request that happens to reach the
 * feature is the failure mode this whole check exists to avoid.
 *
 * When nothing is registered the service stays inert: `hasHandlers` and `hasNotFoundHandler` both
 * answer false and `AsenaServer` never wires the adapter, so an application without a single
 * `@Catch` follows exactly the code path it followed before this service existed.
 */
@CoreService(ICoreServiceNames.PREPARE_EXCEPTION_HANDLER_SERVICE)
export class PrepareExceptionHandlerService implements ICoreService {
  public readonly serviceName = 'PrepareExceptionHandlerService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger!: ServerLogger;

  private readonly registry = new ExceptionRegistry();

  private notFound?: NotFoundEntry;

  /** Whether any `@Catch` was registered. `AsenaServer` wires `adapter.onError` only if so. */
  public get hasHandlers(): boolean {
    return !this.registry.isEmpty;
  }

  /** Whether a `@NotFound()` was registered. */
  public get hasNotFoundHandler(): boolean {
    return this.notFound !== undefined;
  }

  /** A read-only view of the registry, taken after `prepare()`. */
  public get view(): ExceptionRegistryView {
    return {
      catches: this.registry.entries(),
      notFound: this.notFound?.source,
      whoCatches: (error) => this.registry.resolve(error)?.source,
    };
  }

  /**
   * Prepare exception handlers - called during bootstrap, before the adapter starts.
   */
  public async prepare(): Promise<void> {
    const resolved = await this.container.resolveAll<object>(ComponentType.EXCEPTION_HANDLER);

    if (!resolved?.length) {
      return;
    }

    // `resolveAll` yields `(T | T[])[]`: two components sharing a name arrive as a nested array.
    // Flattened rather than rejected - PrepareConfigService refuses the nested shape because it
    // wants exactly one config, whereas several exception handlers are the point.
    const instances = resolved.flat();

    // Type -> where it was already caught. The value is what makes the duplicate error able to
    // name both sides, which is the difference between a fixable message and a scavenger hunt.
    const seenTypes = new Map<ExceptionType, string>();
    let catchAll: string | undefined;

    for (const instance of instances) {
      this.registerHandlerClass(instance, seenTypes, (source) => {
        if (catchAll) {
          throw new Error(
            `Duplicate @Catch() catch-all detected — already handled by ${catchAll}(), ` +
              `conflicts with ${source}(). Only one catch-all is allowed across all @ExceptionHandler classes.`,
          );
        }

        catchAll = source;
      });
    }

    this.announceHttpExceptionCatcher(catchAll);
  }

  /**
   * A handler that receives `HttpException` without naming it silently widens: an application that
   * used to get the adapter's 400 / 401 envelopes now gets whatever this handler returns.
   */
  private announceHttpExceptionCatcher(catchAll: string | undefined): void {
    const advice = `ValidationError and auth 401s — add @Catch(HttpException) if the adapter's envelopes should be kept.`;
    const typed = this.registry.matchClass(HttpException);

    if (typed) {
      if (typed.type !== HttpException) {
        this.logger.info(
          `@Catch(${typed.type.name}) ${yellow(typed.entry.source)}() will also receive HttpException, ${advice}`,
        );
      }

      return;
    }

    if (catchAll) {
      this.logger.info(
        `@Catch() catch-all ${yellow(catchAll)}() will receive every error, including HttpException, ${advice}`,
      );
    }
  }

  /** Whether some `@Catch` would receive this value. Synchronous, so a caller can keep its default path in the same tick. */
  public handles(error: unknown): boolean {
    return this.registry.resolve(error) !== undefined;
  }

  /**
   * Run the `@Catch` chain for a thrown value.
   *
   * @param error - Whatever was thrown. Not necessarily an `Error`.
   * @param context - The scope it was thrown in
   * @returns The handler's return value, or `undefined` when nothing matched, the handler
   *          declined by returning nothing, or the handler itself threw
   */
  public async dispatch(error: unknown, context: ExceptionContext<any>): Promise<unknown> {
    const entry = this.registry.resolve(error);

    return entry ? this.invoke(entry, error, context) : undefined;
  }

  /**
   * Run the `@Catch` chain for a failure in an event scope (`@On`, `@EventPattern`), where a
   * handler can only observe: the caller carries on with the original error whatever it returns.
   * A returned value is reported, since it can only mean the handler expected it to count.
   */
  public async observe(error: unknown, context: ExceptionContext<any>): Promise<void> {
    const entry = this.registry.resolve(error);

    if (!entry) {
      return;
    }

    const result = await this.invoke(entry, error, context);

    if (result !== undefined) {
      this.logger.warn(
        `@Catch handler ${entry.source}() returned a value for an event failure — a return value ` +
          'has no effect in event scopes (@On, @EventPattern); the original error continues unchanged.',
      );
    }
  }

  /**
   * Run the `@Catch` chain for a `@MessagePattern` failure, where the return value becomes the
   * reply. A `Response` is an HTTP answer, never a message reply: it is reported and declined, so
   * the caller sees the original failure instead of a serialized `Response` posing as success.
   *
   * @returns The reply, or `undefined` when nothing matched, the handler declined, threw, or
   *          returned a `Response`
   */
  public async reply(error: unknown, context: MicroserviceExceptionContext): Promise<unknown> {
    const entry = this.registry.resolve(error);

    if (!entry) {
      return undefined;
    }

    const result = await this.invoke(entry, error, context);

    if (result instanceof Response) {
      this.logger.warn(
        `@Catch handler ${entry.source}() returned a Response for @MessagePattern ${context.source}() — a ` +
          'Response is an HTTP answer, not a message reply; it is treated as a decline and the original ' +
          'error reaches the transport.',
      );

      return undefined;
    }

    return result;
  }

  private async invoke(entry: CatchEntry, error: unknown, context: ExceptionContext<any>): Promise<unknown> {
    devtoolsBus.step('catch', entry.source);

    try {
      return await entry.handler(error, context);
    } catch (handlerError) {
      // Treated as a decline, so the framework still answers and still records the *original*
      // failure. A handler that throws must not be able to make the request disappear.
      this.logger.error(
        `@Catch handler ${entry.source}() threw an error, falling back to the framework default:`,
        handlerError,
      );

      return undefined;
    }
  }

  /**
   * Run the `@NotFound()` handler for an unmatched route.
   *
   * @returns The `Response` it produced, or `undefined` when there is none, it declined, or it threw
   */
  public async dispatchNotFound(context: any, request: NotFoundRequest): Promise<Response | undefined> {
    if (!this.notFound) {
      return undefined;
    }

    devtoolsBus.step('not-found', this.notFound.source);

    try {
      const result = await this.notFound.handler(context, request);

      return result instanceof Response ? result : undefined;
    } catch (handlerError) {
      this.logger.error(
        `@NotFound handler ${this.notFound.source}() threw an error, falling back to the framework default:`,
        handlerError,
      );

      return undefined;
    }
  }

  private registerHandlerClass(
    instance: object,
    seenTypes: Map<ExceptionType, string>,
    claimCatchAll: (source: string) => void,
  ): void {
    const className = instance.constructor.name;

    // Chained, not plain getTypedMetadata: @Catch writes to the class declaring the method, so a
    // handler inherited from a base class lives on that base. Same reasoning as
    // PrepareEventService and PrepareMicroserviceService, and the same reader.
    const handlers = getChainedTypedMetadata<Record<string, CatchHandlerMetadata>>(
      ComponentConstants.ExceptionHandlersKey,
      instance.constructor,
    );

    const notFoundHandlers = getChainedTypedMetadata<Record<string, NotFoundHandlerMetadata>>(
      ComponentConstants.NotFoundHandlerKey,
      instance.constructor,
    );

    if (Object.keys(handlers).length === 0 && Object.keys(notFoundHandlers).length === 0) {
      // Registered, injectable, and unreachable. Silent here means someone spends an afternoon
      // wondering why their handler never fires.
      this.logger.warn(
        `@ExceptionHandler '${yellow(className)}' declares no @Catch() or @NotFound() methods — ` +
          'it is registered but will never be called.',
      );

      return;
    }

    this.logInheritedHandlers(instance, className, handlers);

    for (const [methodName, metadata] of Object.entries(handlers)) {
      const source = `${className}.${methodName}`;
      const entry = { handler: (instance as any)[methodName].bind(instance), source };

      if (metadata.types.length === 0) {
        claimCatchAll(source);
      } else {
        for (const type of metadata.types) {
          const existing = seenTypes.get(type);

          if (existing) {
            throw new Error(
              `Duplicate @Catch(${type.name}) detected — already handled by ${existing}(), ` +
                `conflicts with ${source}(). An exception type may be caught in exactly one place; ` +
                'delete one of them, or narrow one to a subclass.',
            );
          }

          seenTypes.set(type, source);
        }
      }

      this.registry.register(metadata.types, entry);
    }

    for (const methodName of Object.keys(notFoundHandlers)) {
      const source = `${className}.${methodName}`;

      if (this.notFound) {
        // Unlike @Catch there is nothing to discriminate on - every unmatched route looks the
        // same - so a second handler is pure ambiguity rather than a narrower match.
        throw new Error(
          `Duplicate @NotFound() detected — already handled by ${this.notFound.source}(), ` +
            `conflicts with ${source}(). Only one @NotFound() handler is allowed across all ` +
            '@ExceptionHandler classes.',
        );
      }

      this.notFound = { handler: (instance as any)[methodName].bind(instance), source };
    }
  }

  /**
   * Report @Catch handlers a class picked up from its base classes.
   *
   * Inherited handlers are invisible in the source of the class you are reading, and here they
   * can also be the reason a duplicate error fires - two siblings sharing a base both inherit its
   * @Catch. Mirrors PrepareEventService.logInheritedHandlers.
   */
  private logInheritedHandlers(
    instance: object,
    className: string,
    handlers: Record<string, CatchHandlerMetadata>,
  ): void {
    const own = getOwnTypedMetadata<Record<string, CatchHandlerMetadata>>(
      ComponentConstants.ExceptionHandlersKey,
      instance.constructor,
    );
    const inherited = Object.keys(handlers).filter((methodName) => !(methodName in (own || {})));

    if (inherited.length === 0) {
      return;
    }

    this.logger.info(`@ExceptionHandler ${yellow(className)} inherits handlers: ${inherited.join(', ')}`);
  }
}
