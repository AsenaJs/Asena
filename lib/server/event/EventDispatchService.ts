import { CoreService } from '../../ioc';
import { ICoreServiceNames } from '../../ioc';
import type { ICoreService } from '../../ioc';
import { matchesEventPattern } from './eventPatternMatcher';
import type { EventHandler, EventSubscription } from './types';

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

  /**
   * All registered event subscriptions
   */
  private handlers: EventSubscription[] = [];

  /**
   * Warmup state - lazy initialization on first dispatch
   */
  private warmedUp = false;

  /**
   * Exact pattern cache for O(1) lookup
   * Key: exact event pattern, Value: handlers for that pattern
   */
  private exactMatches: Map<string, EventHandler[]> = new Map();

  /**
   * Wildcard patterns that need O(n) matching
   */
  private wildcardPatterns: EventSubscription[] = [];

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
  public registerHandler(pattern: string, handler: EventHandler, once = false): void {
    this.handlers.push({ pattern, handler, once });

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

    const handlersToCall: EventSubscription[] = [];

    // 1. Check exact match cache - O(1)
    const exactHandlers = this.exactMatches.get(eventName);
    if (exactHandlers) {
      for (const handler of exactHandlers) {
        // Find full subscription info (for 'once' support)
        const sub = this.handlers.find((s) => s.handler === handler && s.pattern === eventName);
        if (sub) {
          handlersToCall.push(sub);
        }
      }
    }

    // 2. Check wildcard patterns - O(n) but smaller n
    for (const sub of this.wildcardPatterns) {
      if (matchesEventPattern(eventName, sub.pattern)) {
        handlersToCall.push(sub);
      }
    }

    // 3. No handlers matched
    if (handlersToCall.length === 0) {
      return false;
    }

    // 4. Call all matching handlers (fire-and-forget, error isolation)
    for (const sub of handlersToCall) {
      try {
        const result = sub.handler(eventName, data);

        // Smart async detection: If Promise, handle errors but DON'T await
        // Benchmark showed await Promise.resolve(syncHandler()) is 13x slower!
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`[EventDispatchService] Async error in handler for event "${eventName}":`, error);
          });
        }
      } catch (error) {
        // Sync handler error - log but continue with other handlers
        console.error(`[EventDispatchService] Sync error in handler for event "${eventName}":`, error);
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
    this.exactMatches.clear();
    this.wildcardPatterns = [];

    for (const sub of this.handlers) {
      if (sub.pattern.includes('*')) {
        // Wildcard pattern - needs O(n) matching on dispatch
        this.wildcardPatterns.push(sub);
      } else {
        // Exact pattern - O(1) lookup on dispatch
        const handlers = this.exactMatches.get(sub.pattern) || [];
        handlers.push(sub.handler);
        this.exactMatches.set(sub.pattern, handlers);
      }
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
    this.exactMatches.clear();
    this.wildcardPatterns = [];
    this.warmedUp = false;
  }
}
