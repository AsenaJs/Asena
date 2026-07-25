import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils';
import type { EventPatternParams, MessageHandlerMetadata } from '../types';

/**
 * @description EventPattern decorator - Marks a method as a fire-and-forget event handler
 *
 * Methods decorated with @EventPattern will be automatically registered into the
 * configured microservice transport when the server boots (via PrepareMicroserviceService).
 * No reply is produced; delivery is at-least-once on durable transports, so handlers
 * should be idempotent (use context.messageId for deduplication).
 *
 * The controller prefix is joined onto the pattern ('order' + 'created' →
 * 'order.created'), matching what ulak.messages('order').emit('created') publishes.
 * Pass `prefix: false` when the pattern is absolute — another service's event
 * vocabulary, a Kafka external topic name, or a global catch-all.
 * Wildcards are supported: 'payment.*', '*.completed', 'user.*.created'.
 * Note that under a prefix, '*' becomes 'order.*' and is no longer a global catch-all.
 *
 * @param params - Event pattern or configuration object
 *
 * @example
 * @MessageController('order')
 * export class OrderHandler {
 *   @EventPattern('created')  // Handles 'order.created'
 *   async onCreated(event: OrderEvent, context: MessageContext) { }
 *
 *   // Absolute - another service's event vocabulary
 *   @EventPattern({ pattern: 'payment.completed', prefix: false })
 *   async onPaymentCompleted(event: PaymentEvent, context: MessageContext) {
 *     await this.orderService.markPaid(event.orderId);
 *   }
 *
 *   @EventPattern('*')  // Wildcards allowed - handles 'order.*'
 *   async onAnyOrderEvent(event: any, context: MessageContext) { }
 *
 *   @EventPattern({ pattern: 'stock.depleted', skip: true })  // Temporarily disabled
 *   async onStockDepleted(event: any, context: MessageContext) { }
 * }
 */
export function EventPattern(params: EventPatternParams | string): MethodDecorator {
  // Normalize params - support both object and string
  const _params = typeof params === 'string' ? { pattern: params, skip: false } : params;

  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    // Get existing handlers metadata (other @MessagePattern/@EventPattern methods)
    const handlers =
      getOwnTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        target.constructor,
      ) || {};

    // Add this handler's metadata
    handlers[propertyKey.toString()] = {
      pattern: _params.pattern,
      type: 'event',
      methodName: propertyKey.toString(),
      // `!== false` covers the string shorthand and objects that omit the flag
      prefix: _params.prefix !== false,
      skip: _params.skip || false,
    };

    // Store updated metadata
    defineTypedMetadata(ComponentConstants.MessageHandlersKey, handlers, target.constructor);

    return descriptor;
  };
}
