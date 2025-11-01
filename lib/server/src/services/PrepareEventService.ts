import type { Container, ICoreService } from '../../../ioc';
import { ComponentConstants, ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';
import { getTypedMetadata } from '../../../utils';
import type { EventHandlerMetadata, EventDispatchService } from '../../event';

/**
 * @description PrepareEventService - Registers event handlers during bootstrap
 *
 * Scan Process:
 * 1. Resolve all ComponentType.EVENT from container
 * 2. Extract prefix metadata from class
 * 3. Extract handler metadata (@On methods)
 * 4. Build final pattern: prefix + event
 * 5. Bind method to instance
 * 6. Register with EventEmitter
 *
 * Pattern Building:
 * - No prefix, event='user.created' → 'user.created'
 * - Prefix='user', event='created' → 'user.created'
 * - Prefix='user', event='*.updated' → 'user.*.updated'
 * - Prefix='user', event='' → 'user'
 */
@CoreService(ICoreServiceNames.PREPARE_EVENT_SERVICE)
export class PrepareEventService implements ICoreService {
  public readonly serviceName = 'PrepareEventService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  @Inject(ICoreServiceNames.EVENT_DISPATCH_SERVICE)
  private dispatchService!: EventDispatchService;

  /**
   * Prepare event handlers - Called during bootstrap
   */
  public async prepare(): Promise<void> {
    // 1. Resolve all event services
    const eventServices = await this.container.resolveAll<any>(ComponentType.EVENT);

    if (!eventServices || eventServices.length === 0) {
      // No event services registered - skip
      return;
    }

    // 2. Process each event service
    for (const service of eventServices) {
      await this.registerEventService(service);
    }
  }

  /**
   * Register all handlers from a single event service
   */
  private async registerEventService(service: any): Promise<void> {
    // Extract prefix metadata
    const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, service.constructor) || '';

    // Extract handlers metadata
    const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
      ComponentConstants.EventHandlersKey,
      service.constructor,
    );

    if (!handlers) {
      // No @On methods - skip
      return;
    }

    // Register each handler
    for (const [methodName, metadata] of Object.entries(handlers)) {
      // Skip if explicitly marked
      if (metadata.skip) {
        continue;
      }

      // Build final event pattern
      const finalPattern = this.buildEventPattern(prefix, metadata.pattern);

      // Bind method to service instance
      const boundHandler = service[methodName].bind(service);

      // Register with EventEmitter
      this.dispatchService.registerHandler(finalPattern, boundHandler);
    }
  }

  /**
   * Build final event pattern from prefix and event
   *
   * Rules:
   * - No prefix → event
   * - No event → prefix
   * - Both → prefix.event
   */
  private buildEventPattern(prefix: string, event: string): string {
    if (!prefix) return event;
    if (!event) return prefix;
    return `${prefix}.${event}`;
  }
}
