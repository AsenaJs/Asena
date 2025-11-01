import { ComponentConstants, ComponentType } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';
import { defineTypedMetadata } from '../../../utils';
import type { EventServiceParams } from '../../event';

/**
 * @description EventService decorator - Marks a class as an event service
 *
 * Event services contain @On decorated methods that handle events.
 *
 * @param params - Optional configuration or prefix string
 *
 * @example
 * // With prefix
 * @EventService({ prefix: 'user' })
 * export class UserEventService {
 *   @On('created')  // Handles 'user.created' event
 *   handleUserCreated(eventName: string, data: any) {
 *     console.log('User created:', data);
 *   }
 * }
 *
 * @example
 * // Without prefix
 * @EventService()
 * export class GlobalEventService {
 *   @On('app.started')
 *   handleAppStarted() {
 *     console.log('App started');
 *   }
 * }
 *
 * @example
 * // Shorthand with prefix string
 * @EventService('download')
 * export class DownloadEventService {
 *   @On('complete')  // Handles 'download.complete'
 *   handleComplete(eventName: string, data: any) { }
 * }
 */
export const EventService = (params?: EventServiceParams | string): ClassDecorator => {
  // Normalize params - support both object and string
  const _params =
    typeof params === 'string' ? { prefix: params, name: undefined } : params || { prefix: undefined, name: undefined };

  return defineComponent(ComponentType.EVENT, _params, (target) => {
    // Store prefix metadata for PrepareEventService
    defineTypedMetadata<string>(ComponentConstants.EventPrefixKey, _params.prefix || '', target);
  });
};
