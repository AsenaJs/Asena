import type { ComponentParams } from '../../ioc';
import type { MessageContext } from './MicroserviceTransport';

/**
 * @description Name used when a single (unnamed) microservice transport is configured
 */
export const DEFAULT_TRANSPORT_NAME = 'default';

/**
 * @description Parameters for @MessageController decorator
 */
export interface MessageControllerParams extends ComponentParams {
  /**
   * Prefix joined (with a dot) onto every @MessagePattern AND @EventPattern in
   * this controller. A single handler opts out with `prefix: false`.
   * Must be a literal path segment — a wildcard prefix is rejected at boot.
   * @example 'order' turns @MessagePattern('create') into 'order.create'
   *          and @EventPattern('created') into 'order.created'
   */
  prefix?: string;

  /**
   * Name of the microservice transport this controller binds to.
   * Only needed when multiple named transports are configured in transport()
   * (e.g. part of the project on Redis, part on NATS).
   * @default 'default'
   */
  transport?: string;
}

/**
 * @description Parameters for @MessagePattern method decorator
 */
export interface MessagePatternParams {
  /**
   * Request pattern to handle. Must be exact — wildcards are not allowed
   * (request/response requires exact routing).
   * @example 'create' (joined with the controller prefix → 'order.create')
   */
  pattern: string;

  /**
   * Join the @MessageController prefix onto `pattern`.
   * Set false to register the pattern verbatim — for patterns that belong to
   * another service's vocabulary rather than this controller's.
   * @default true
   */
  prefix?: boolean;

  /**
   * Skip this handler (useful for temporarily disabling handlers)
   * @default false
   */
  skip?: boolean;
}

/**
 * @description Parameters for @EventPattern method decorator
 */
export interface EventPatternParams {
  /**
   * Event pattern to handle. Wildcards are supported.
   * The controller prefix is joined on unless `prefix: false`.
   * @example 'created' (joined with the controller prefix → 'order.created')
   */
  pattern: string;

  /**
   * Join the @MessageController prefix onto `pattern`.
   * Set false for absolute names: another service's event vocabulary, a Kafka
   * external topic name, or a global catch-all ('*').
   * @default true
   */
  prefix?: boolean;

  /**
   * Skip this handler (useful for temporarily disabling handlers)
   * @default false
   */
  skip?: boolean;
}

/**
 * @description Metadata stored for each @MessagePattern/@EventPattern method
 * Used by PrepareMicroserviceService to register handlers into the transport
 */
export interface MessageHandlerMetadata {
  /**
   * Pattern as written on the decorator. The @MessageController prefix is
   * joined on later by PrepareMicroserviceService unless `prefix` is false.
   */
  pattern: string;

  /**
   * Handler semantics: request/response ('message') or fire-and-forget ('event')
   */
  type: 'message' | 'event';

  /**
   * Method name to call when a message arrives
   */
  methodName: string;

  /**
   * Whether the controller prefix is joined onto `pattern`.
   * Normalized at decoration time (`prefix: false` opt-out → false).
   */
  prefix: boolean;

  /**
   * Whether this handler should be skipped
   */
  skip: boolean;
}

/**
 * @description Context passed to MessagingInterceptor.onSend for outgoing messages
 */
export interface OutboundContext {
  /**
   * Full outgoing pattern (prefix already applied)
   */
  pattern: string;

  /**
   * Whether this is a request ('send') or a fire-and-forget event ('emit')
   */
  kind: 'send' | 'emit';

  /**
   * Mutable outgoing headers — interceptors inject metadata here (e.g. trace context)
   */
  headers: Record<string, string>;

  /**
   * Outgoing payload (read-only by convention)
   */
  data: unknown;
}

/**
 * @description Zero-dependency messaging interceptor SPI.
 *
 * Both hooks are wrappers around the actual operation, so an interceptor can
 * measure duration and observe errors/replies (e.g. OpenTelemetry spans).
 * Interceptors are registered via the transport() config hook:
 * `transport() { return { microservice, interceptors: [myInterceptor] } }`
 */
export interface MessagingInterceptor {
  /**
   * Wraps outgoing send/emit. Mutate ctx.headers to inject metadata,
   * call next() to perform the operation (its promise resolves with the
   * reply for 'send', undefined for 'emit').
   */
  onSend?(ctx: OutboundContext, next: () => Promise<any>): Promise<any>;

  /**
   * Wraps an incoming handler invocation. Call next() to run the handler
   * (and any inner interceptors); its promise carries the handler result.
   */
  onReceive?(ctx: MessageContext, next: () => Promise<any>): Promise<any>;
}
