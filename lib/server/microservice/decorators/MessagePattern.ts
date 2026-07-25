import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils';
import type { MessageHandlerMetadata, MessagePatternParams } from '../types';

/**
 * @description MessagePattern decorator - Marks a method as a request/response handler
 *
 * Methods decorated with @MessagePattern will be automatically registered into the
 * configured microservice transport when the server boots (via PrepareMicroserviceService).
 * The method's return value is sent back to the caller as the reply.
 *
 * The controller prefix is joined onto the pattern ('order' + 'create' → 'order.create').
 * Pass `prefix: false` to register the pattern verbatim.
 * Wildcards are NOT allowed — request/response requires exact routing — and
 * `prefix: false` does not relax that.
 *
 * @param params - Request pattern or configuration object
 *
 * @example
 * @MessageController('order')
 * export class OrderHandler {
 *   @MessagePattern('create')  // Handles 'order.create'
 *   async create(data: CreateOrderDto, context: MessageContext) {
 *     return this.orderService.create(data);  // reply sent to caller
 *   }
 *
 *   @MessagePattern({ pattern: 'ping', prefix: false })  // Handles 'ping'
 *   async ping(data: any, context: MessageContext) { }
 *
 *   @MessagePattern({ pattern: 'delete', skip: true })  // Temporarily disabled
 *   async delete(data: any, context: MessageContext) { }
 * }
 */
export function MessagePattern(params: MessagePatternParams | string): MethodDecorator {
  // Normalize params - support both object and string
  const _params = typeof params === 'string' ? { pattern: params, skip: false } : params;

  if (_params.pattern.includes('*')) {
    throw new Error(
      `@MessagePattern('${_params.pattern}') cannot contain wildcards - request/response requires exact patterns. Use @EventPattern for wildcard subscriptions.`,
    );
  }

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
      type: 'message',
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
