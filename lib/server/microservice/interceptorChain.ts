import type { MessageContext } from './MicroserviceTransport';
import type { MessagingInterceptor, OutboundContext } from './types';

/**
 * @description Composes interceptor onSend hooks around an outgoing operation.
 * Interceptors run in registration order (first interceptor is outermost).
 *
 * @param interceptors - Registered messaging interceptors
 * @param ctx - Outbound context (interceptors may mutate ctx.headers)
 * @param operation - The actual transport send/emit call
 */
export function composeOnSend(
  interceptors: MessagingInterceptor[],
  ctx: OutboundContext,
  operation: () => Promise<any>,
): Promise<any> {
  let next = operation;

  for (let i = interceptors.length - 1; i >= 0; i--) {
    const interceptor = interceptors[i];

    if (interceptor.onSend) {
      const inner = next;

      next = () => interceptor.onSend(ctx, inner);
    }
  }

  return next();
}

/**
 * @description Composes interceptor onReceive hooks around a handler invocation.
 * Interceptors run in registration order (first interceptor is outermost).
 *
 * @param interceptors - Registered messaging interceptors
 * @param ctx - Incoming message context
 * @param operation - The actual handler invocation
 */
export function composeOnReceive(
  interceptors: MessagingInterceptor[],
  ctx: MessageContext,
  operation: () => Promise<any>,
): Promise<any> {
  let next = operation;

  for (let i = interceptors.length - 1; i >= 0; i--) {
    const interceptor = interceptors[i];

    if (interceptor.onReceive) {
      const inner = next;

      next = () => interceptor.onReceive(ctx, inner);
    }
  }

  return next();
}
