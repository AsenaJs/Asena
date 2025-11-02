import type { ICoreService } from '../../ioc';
import { CoreService, ICoreServiceNames } from '../../ioc';
import { Inject } from '../../ioc/component';
import type { EventDispatchService } from './EventDispatchService';

/**
 * @description Event Emitter - Public API for event-driven architecture
 *
 * Architecture:
 * - EventEmitter (public API) → EventDispatchService (internal logic)
 * - Similar pattern to: AsenaWebSocketService → AsenaWebSocketServer
 *
 * Usage:
 * ```typescript
 * // In your code
 * @Inject(emitter())
 * private emitter!: EventEmitter;
 *
 * // Emit events
 * this.emitter.emit('user.created', { id: 123, name: 'John' });
 * ```
 *
 * Event handlers are registered via decorators:
 * ```typescript
 * @EventService({ prefix: 'user' })
 * export class UserEventService {
 *   @On('created')
 *   handleUserCreated(eventName: string, data: any) {
 *     // Handle event
 *   }
 * }
 * ```
 *
 * Fire-and-Forget Pattern:
 * - emit() returns immediately (doesn't wait for handlers)
 * - Async handlers are executed without blocking
 * - Handler errors are isolated and logged
 *
 * @see EventDispatchService for internal implementation details
 */
@CoreService(ICoreServiceNames.EVENT_EMITTER)
export class EventEmitter implements ICoreService {
  public readonly serviceName = 'EventEmitter';

  @Inject(ICoreServiceNames.EVENT_DISPATCH_SERVICE)
  private dispatcher!: EventDispatchService;

  /**
   * Emit an event to all registered handlers
   *
   * Fire-and-forget pattern (Spring style):
   * - Returns immediately without waiting for handlers
   * - Async handlers execute in background
   * - Handler errors are caught and logged
   *
   * @param eventName - Event name to emit (e.g., 'user.created', 'download.complete')
   * @param data - Optional data to pass to handlers
   * @returns true if any handler was called, false if no handlers matched
   *
   * @example
   * // Emit event with data
   * const success = this.emitter.emit('user.created', { id: 123, name: 'John' });
   *
   * @example
   * // Emit event without data
   * this.emitter.emit('app.started');
   *
   * @example
   * // Check if event was handled
   * if (!this.emitter.emit('user.created', data)) {
   *   console.warn('No handlers registered for user.created event');
   * }
   */
  public emit(eventName: string, data?: any): boolean {
    return this.dispatcher.dispatch(eventName, data);
  }
}
