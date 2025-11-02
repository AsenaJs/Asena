import type { ComponentParams } from '../../ioc';

/**
 * @description Parameters for @EventService decorator
 * Defines event service configuration including prefix for pattern matching
 */
export interface EventServiceParams extends ComponentParams {
  /**
   * Prefix for event patterns (used in pattern matching)
   * @example 'download' for events like 'download.start', 'download.complete'
   */
  prefix?: string;
}

/**
 * @description Parameters for @On method decorator
 * Defines event handler configuration
 */
export interface OnParams {
  /**
   * Event pattern to listen for
   * Supports wildcards: *, download.*, *.complete, user.*.created
   * @example 'download.complete' or 'download.*'
   */
  event: string;

  /**
   * Skip this handler (useful for temporarily disabling handlers)
   * @default false
   */
  skip?: boolean;
}

/**
 * @description Metadata stored for each event handler method
 * Used by PrepareEventService to register handlers
 */
export interface EventHandlerMetadata {
  /**
   * Event pattern to match
   */
  pattern: string;

  /**
   * Method name to call when event is emitted
   */
  methodName: string;

  /**
   * Whether this handler should be skipped
   */
  skip: boolean;
}

/**
 * @description Event handler function signature
 * Handlers receive event name and optional data
 */
export type EventHandler<T = any> = (eventName: string, data?: T) => void | Promise<void>;

/**
 * @description Event subscription internal structure
 * Used by EventBus to store and manage subscriptions
 */
export interface EventSubscription {
  /**
   * Event pattern for matching
   */
  pattern: string;

  /**
   * Handler function to execute
   */
  handler: EventHandler;

  /**
   * Whether this is a one-time subscription (once)
   */
  once?: boolean;
}
