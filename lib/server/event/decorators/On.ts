import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils';
import type { EventHandlerMetadata, OnParams } from '../types';

/**
 * @description On decorator - Marks a method as an event handler
 *
 * Methods decorated with @On will be automatically registered when
 * the event system boots up (via PrepareEventService).
 *
 * @param params - Event pattern or configuration object
 *
 * @example
 * @EventService({ prefix: 'user' })
 * export class UserEventService {
 *   @On('created')  // Handles 'user.created'
 *   handleCreated(eventName: string, data: any) {
 *     console.log('User created:', data);
 *   }
 *
 *   @On('*.updated')  // Handles 'user.*.updated'
 *   handleUpdated(eventName: string, data: any) { }
 *
 *   @On({ event: 'deleted', skip: true })  // Temporarily disabled
 *   handleDeleted(eventName: string, data: any) { }
 * }
 *
 * @example
 * // Without prefix (absolute pattern)
 * @EventService()
 * export class GlobalEventService {
 *   @On('*')  // Handles ALL events
 *   handleAll(eventName: string, data: any) {
 *     console.log('Event:', eventName);
 *   }
 *
 *   @On('*.error')  // Handles all error events
 *   handleErrors(eventName: string, data: any) { }
 * }
 */
export function On(params: OnParams | string): MethodDecorator {
  // Normalize params - support both object and string
  const _params = typeof params === 'string' ? { event: params, skip: false } : params;

  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    // Get existing handlers metadata (other @On methods)
    const handlers =
      getOwnTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        target.constructor,
      ) || {};

    // Add this handler's metadata
    handlers[propertyKey.toString()] = {
      pattern: _params.event,
      methodName: propertyKey.toString(),
      skip: _params.skip || false,
    };

    // Store updated metadata
    defineTypedMetadata(ComponentConstants.EventHandlersKey, handlers, target.constructor);

    return descriptor;
  };
}
