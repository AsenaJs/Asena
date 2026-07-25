import { ComponentConstants, ComponentType } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';
import { defineTypedMetadata } from '../../../utils';
import { DEFAULT_TRANSPORT_NAME } from '../../microservice';
import type { MessageControllerParams } from '../../microservice';

/**
 * @description MessageController decorator - Marks a class as a microservice message controller
 *
 * Message controllers contain @MessagePattern (request/response) and
 * @EventPattern (fire-and-forget) decorated methods. They are registered into the
 * microservice transport configured via the @Config transport() hook.
 *
 * The prefix is joined (with a dot) onto every @MessagePattern AND @EventPattern
 * in the class. A single handler opts out with `prefix: false`.
 *
 * @param params - Optional configuration or prefix string
 *
 * @example
 * // With prefix
 * @MessageController('order')
 * export class OrderHandler {
 *   @MessagePattern('create')  // Handles 'order.create'
 *   async create(data: CreateOrderDto, context: MessageContext) {
 *     return this.orderService.create(data);
 *   }
 *
 *   @EventPattern('created')  // Handles 'order.created'
 *   async onCreated(event: OrderEvent) { }
 *
 *   // Absolute - another service's event vocabulary
 *   @EventPattern({ pattern: 'payment.completed', prefix: false })
 *   async onPaymentCompleted(event: PaymentEvent) { }
 * }
 *
 * @example
 * // Without prefix
 * @MessageController()
 * export class GlobalHandler {
 *   @MessagePattern('ping')  // Handles 'ping'
 *   async ping() {
 *     return 'pong';
 *   }
 * }
 *
 * @example
 * // Bound to a named transport (multi-broker projects)
 * @MessageController({ prefix: 'metrics', transport: 'analytics' })
 * export class AnalyticsHandler {
 *   @EventPattern('page.viewed')  // Handles 'metrics.page.viewed'
 *   async onPageViewed(event: PageViewedEvent) { }
 * }
 */
export const MessageController = (params?: MessageControllerParams | string): ClassDecorator => {
  // Normalize params BEFORE defineComponent - a bare string must become a prefix,
  // otherwise paramsGenerator would treat it as the component name
  const _params =
    typeof params === 'string' ? { prefix: params, name: undefined } : params || { prefix: undefined, name: undefined };

  return defineComponent(ComponentType.MESSAGE_CONTROLLER, _params, (target) => {
    // Store prefix + transport binding metadata for PrepareMicroserviceService
    defineTypedMetadata<string>(ComponentConstants.MessagePrefixKey, _params.prefix || '', target);

    defineTypedMetadata<string>(
      ComponentConstants.MessageTransportKey,
      _params.transport || DEFAULT_TRANSPORT_NAME,
      target,
    );
  });
};
