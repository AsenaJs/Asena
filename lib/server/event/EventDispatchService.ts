import { CoreService } from '../../ioc';
import { ICoreServiceNames } from '../../ioc';
import type { ICoreService } from '../../ioc';
import { Inject } from '../../ioc/component';
import type { EventExceptionContext } from '../exception/types';
import type { PrepareExceptionHandlerService } from '../src/services/PrepareExceptionHandlerService';
import { PatternHandlerIndex } from './PatternHandlerIndex';
import type { DevtoolsScope } from '../../devtools/DevtoolsScope';
import type { EventHandler, EventSubscription } from './types';
import { isThenable } from '../../utils/isThenable';

/**
 * @description Internal event dispatch service
 * Handles pattern matching, storage, and dispatching of events
 *
 * Architecture:
 * - EventEmitter (public API) → EventDispatchService (internal logic)
 * - Similar to: AsenaWebSocketService → AsenaWebSocketServer
 *
 * Performance:
 * - Exact patterns: O(1) lookup via Map
 * - Wildcard patterns: O(n) check via Array
 * - Lazy warmup: Indexes built on first dispatch
 *
 * @internal This service should not be used directly by users
 */
@CoreService(ICoreServiceNames.EVENT_DISPATCH_SERVICE)
export class EventDispatchService implements ICoreService {
  public readonly serviceName = 'EventDispatchService';

  @Inject(ICoreServiceNames.PREPARE_EXCEPTION_HANDLER_SERVICE)
  private exceptions?: PrepareExceptionHandlerService;

  @Inject(ICoreServiceNames.DEVTOOLS_SCOPE)
  private devtools?: DevtoolsScope;

  /**
   * All registered event subscriptions
   */
  private handlers: EventSubscription[] = [];

  /**
   * Warmup state - lazy initialization on first dispatch
   */
  private warmedUp = false;

  /**
   * Hybrid lookup index (exact Map + wildcard array), shared implementation
   * with the microservice transports
   */
  private index = new PatternHandlerIndex<EventSubscription>();

  /**
   * Register a handler for an event pattern
   *
   * @param pattern - Event pattern (supports wildcards: 'user.*', '*.error')
   * @param handler - Handler function to execute
   * @param once - If true, handler will be removed after first execution
   *
   * @example
   * registerHandler('user.created', (eventName, data) => { ... });
   * registerHandler('download.*', (eventName, data) => { ... });
   */
  public registerHandler(pattern: string, handler: EventHandler, once = false, source?: string): void {
    this.handlers.push(source === undefined ? { pattern, handler, once } : { pattern, handler, once, source });

    // Invalidate warmup cache - will rebuild on next dispatch
    this.warmedUp = false;
  }

  /**
   * Unregister a specific handler for a pattern
   *
   * @param pattern - Event pattern to unregister from
   * @param handler - Handler function to remove
   * @returns true if handler was found and removed, false otherwise
   */
  public unregisterHandler(pattern: string, handler: EventHandler): boolean {
    const index = this.handlers.findIndex((sub) => sub.pattern === pattern && sub.handler === handler);

    if (index !== -1) {
      this.handlers.splice(index, 1);

      // Invalidate warmup cache
      this.warmedUp = false;

      return true;
    }

    return false;
  }

  /**
   * Dispatch an event to all matching handlers
   *
   * Fire-and-forget pattern:
   * - Returns immediately, doesn't wait for async handlers
   * - Async handler errors are caught and logged
   * - Handlers are isolated (one error doesn't affect others)
   *
   * @param eventName - Event name to dispatch
   * @param data - Optional data to pass to handlers
   * @returns true if any handler was called, false if no handlers matched
   *
   * @example
   * dispatch('user.created', { id: 123, name: 'John' }); // Returns true/false
   */
  public dispatch(eventName: string, data?: any): boolean {
    // Lazy warmup - build indexes on first dispatch
    if (!this.warmedUp) {
      this.warmup();
    }

    // 1-2. Collect matching subscriptions: exact matches O(1), then wildcards O(n)
    const handlersToCall = this.index.collect(eventName);

    // 3. No handlers matched
    if (handlersToCall.length === 0) {
      return false;
    }

    // 4. Call all matching handlers (fire-and-forget, error isolation)
    for (const sub of handlersToCall) {
      if (this.devtools?.enabled) {
        this.dispatchObserved(this.devtools, sub, eventName, data);
        continue;
      }

      try {
        const result = sub.handler(eventName, data);

        // Wrapping every result in Promise.resolve() measured ~80x slower for sync handlers.
        if (isThenable(result)) {
          Promise.resolve(result).catch((error) => {
            void this.handleFailure(sub, eventName, data, error, 'Async');
          });
        }
      } catch (error) {
        // Sync handler error - log but continue with other handlers
        void this.handleFailure(sub, eventName, data, error, 'Sync');
      }
    }

    // 5. Remove 'once' handlers
    for (const sub of handlersToCall) {
      if (sub.once) {
        this.unregisterHandler(sub.pattern, sub.handler);
      }
    }

    return true;
  }

  /**
   * The same call and failure handling as the plain loop, framed as a devtools record that stays
   * open until a matching `@Catch` has observed the failure.
   */
  private dispatchObserved(devtools: DevtoolsScope, sub: EventSubscription, eventName: string, data: unknown): void {
    devtools
      .observe('@On', eventName, sub.source ?? sub.pattern, async () => {
        let result: unknown;

        try {
          result = sub.handler(eventName, data);
        } catch (error) {
          await this.handleFailure(sub, eventName, data, error, 'Sync');
          throw error;
        }

        try {
          await result;
        } catch (error) {
          await this.handleFailure(sub, eventName, data, error, 'Async');
          throw error;
        }
      })
      .catch(() => undefined);
  }

  /**
   * Log a handler failure, then show it to a matching `@Catch`.
   *
   * Events are observe-only: the error line is logged in the same tick whether or not a `@Catch`
   * matches, and nothing the `@Catch` returns or throws changes that.
   *
   * @returns The `@Catch` run, which only the devtools path waits for
   */
  private handleFailure(
    sub: EventSubscription,
    eventName: string,
    data: unknown,
    error: unknown,
    kind: 'Sync' | 'Async',
  ): Promise<void> | undefined {
    console.error(`[EventDispatchService] ${kind} error in handler for event "${eventName}":`, error);

    const exceptions = this.exceptions;

    if (!exceptions?.handles(error)) {
      return undefined;
    }

    const context: EventExceptionContext =
      sub.source === undefined
        ? { scope: 'event', event: eventName, data }
        : { scope: 'event', event: eventName, data, source: sub.source };

    return exceptions.observe(error, context).catch(() => undefined);
  }

  /**
   * Warmup - Build indexes for faster lookup
   *
   * Strategy (Hybrid):
   * - Exact patterns → Map (O(1) lookup)
   * - Wildcard patterns → Array (O(n) check needed)
   *
   * This is lazy initialization:
   * - Called automatically on first dispatch
   * - Invalidated when handlers change
   *
   * Performance:
   * - Exact patterns: O(1) - Most common case
   * - Wildcard patterns: O(n) - Less common, smaller n
   *
   * @private
   */
  private warmup(): void {
    this.index.clear();

    for (const sub of this.handlers) {
      this.index.add(sub.pattern, sub);
    }

    this.warmedUp = true;
  }

  /**
   * Get all registered handlers (for debugging/testing)
   *
   * @returns Array of all event subscriptions
   * @internal
   */
  public getHandlers(): EventSubscription[] {
    return [...this.handlers];
  }

  /**
   * Clear all registered handlers
   *
   * @internal Used for testing and cleanup
   */
  public clearHandlers(): void {
    this.handlers = [];
    this.index.clear();
    this.warmedUp = false;
  }
}
