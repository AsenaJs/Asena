import type { Container, ICoreService } from '../../../ioc';
import { ComponentConstants, ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';
import { getChainedTypedMetadata, getOwnTypedMetadata, getTypedMetadata } from '../../../utils';
import { type ServerLogger, yellow } from '../../../logger';
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
 * - Handler opted out (prefix: false) → event, verbatim
 */
@CoreService(ICoreServiceNames.PREPARE_EVENT_SERVICE)
export class PrepareEventService implements ICoreService {
  public readonly serviceName = 'PrepareEventService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  @Inject(ICoreServiceNames.EVENT_DISPATCH_SERVICE)
  private dispatchService!: EventDispatchService;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger!: ServerLogger;

  /**
   * Report @On handlers an event service picked up from its base classes
   *
   * Inherited handlers are invisible in the source of the class you are reading, so the
   * resolved set is logged. Silent when the service declares all of its own handlers.
   */
  private logInheritedHandlers(service: any, handlers: Record<string, EventHandlerMetadata>): void {
    const own = getOwnTypedMetadata<Record<string, EventHandlerMetadata>>(
      ComponentConstants.EventHandlersKey,
      service.constructor,
    );
    const inherited = Object.keys(handlers).filter((methodName) => !(methodName in (own || {})));

    if (inherited.length === 0) {
      return;
    }

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, service.constructor) || service.constructor.name;

    this.logger.info(`EventService ${yellow(name)} inherits handlers: ${inherited.join(', ')}`);
  }

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

    // Chained, not plain getTypedMetadata: @On writes to the class declaring the method, and
    // reading the nearest ancestor's record whole meant one @On on the subclass shadowed
    // every handler it inherited.
    const handlers = getChainedTypedMetadata<Record<string, EventHandlerMetadata>>(
      ComponentConstants.EventHandlersKey,
      service.constructor,
    );

    if (Object.keys(handlers).length === 0) {
      // No @On methods - skip
      return;
    }

    this.logInheritedHandlers(service, handlers);

    // Register each handler
    for (const [methodName, metadata] of Object.entries(handlers)) {
      // Skip if explicitly marked
      if (metadata.skip) {
        continue;
      }

      // Build final event pattern
      // `!== false`: metadata written by a pre-0.8 decorator build carries no
      // flag and must follow the current default (apply the prefix)
      const finalPattern = this.buildEventPattern(prefix, metadata.pattern, metadata.prefix !== false);

      // Bind method to service instance
      const boundHandler = service[methodName].bind(service);

      // Register with EventEmitter
      this.dispatchService.registerHandler(finalPattern, boundHandler);
    }
  }

  /**
   * Build final event pattern from prefix and event
   *
   * Rules (identical to PrepareMicroserviceService.buildPattern and
   * UlakMessages.buildPattern):
   * - Handler opted out (prefix: false) → event
   * - No prefix → event
   * - No event → prefix
   * - Both → prefix.event
   */
  private buildEventPattern(prefix: string, event: string, applyPrefix: boolean): string {
    if (!applyPrefix) return event;
    if (!prefix) return event;
    if (!event) return prefix;
    return `${prefix}.${event}`;
  }
}
