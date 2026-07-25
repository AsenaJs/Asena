/**
 * @description Context passed to every microservice message/event handler.
 * Carries transport-level metadata about the incoming message.
 */
export interface MessageContext {
  /**
   * Concrete pattern of the incoming message (e.g. 'order.create')
   */
  pattern: string;

  /**
   * Transport-assigned unique id of the message (e.g. Redis stream entry id).
   * Useful for idempotency/deduplication in at-least-once transports.
   */
  messageId: string;

  /**
   * Correlation id, present only for request/response messages
   */
  correlationId?: string;

  /**
   * Message headers (trace context, user metadata, ...)
   */
  headers: Record<string, string>;

  /**
   * Producer-side timestamp (epoch millis)
   */
  timestamp: number;

  /**
   * Delivery attempt number, starting at 1.
   * Greater than 1 means the message was redelivered (at-least-once transports).
   */
  attempt: number;
}

/**
 * @description Handler for request/response messages (@MessagePattern).
 * The return value is serialized and sent back to the caller as the reply.
 */
export type MessageHandler = (data: any, context: MessageContext) => any | Promise<any>;

/**
 * @description Handler for fire-and-forget events (@EventPattern)
 */
export type EventPatternHandler = (data: any, context: MessageContext) => void | Promise<void>;

/**
 * @description Options for request/response sends
 */
export interface SendOptions {
  /**
   * Reply timeout in milliseconds (transport default applies when omitted)
   */
  timeout?: number;

  /**
   * Extra headers attached to the outgoing message
   */
  headers?: Record<string, string>;
}

/**
 * @description Options for fire-and-forget emits
 */
export interface EmitOptions {
  /**
   * Extra headers attached to the outgoing event
   */
  headers?: Record<string, string>;
}

/**
 * @description Options for transport shutdown
 */
export interface DestroyOptions {
  /**
   * Max time in milliseconds to wait for in-flight handlers to finish
   * before closing connections (graceful drain)
   */
  drainTimeout?: number;
}

/**
 * @description Broker-agnostic microservice transport SPI.
 *
 * A transport carries two message semantics between Asena services:
 * - request/response (@MessagePattern) — exact patterns, a reply is produced
 * - fire-and-forget events (@EventPattern) — wildcard patterns allowed
 *
 * Lifecycle contract (driven by PrepareMicroserviceService):
 * 1. registerMessageHandler / registerEventHandler — push all handler registrations
 * 2. init() — connect broker resources; after init, send/emit must work (client-only mode)
 * 3. listen() — start consuming. MUST only consume sources that have at least one
 *    registered handler; with zero handlers no consumer may be started (client-only mode)
 * 4. destroy() — graceful drain, then release all resources
 */
export interface MicroserviceTransport {
  /**
   * Human-readable transport name (used in logs and health reporting)
   */
  readonly name: string;

  /**
   * Whether the transport currently holds a live broker connection.
   * Read by the health endpoint.
   */
  readonly isConnected: boolean;

  /**
   * Connect broker resources. Called once before listen().
   * After init() resolves, send()/emit() must be usable (client-only mode).
   */
  init(): Promise<void>;

  /**
   * Register a request/response handler. Patterns must be exact (no wildcards).
   */
  registerMessageHandler(pattern: string, handler: MessageHandler): void;

  /**
   * Register a fire-and-forget event handler. Patterns arrive with the
   * @MessageController prefix already resolved and may contain wildcards
   * (e.g. 'payment.*').
   */
  registerEventHandler(pattern: string, handler: EventPatternHandler): void;

  /**
   * Start consuming registered patterns.
   * Contract: only sources with at least one registered handler are consumed;
   * with zero handlers no consumer loop is started.
   */
  listen(): Promise<void>;

  /**
   * Send a request and await its reply (request/response semantics)
   */
  send<T = unknown>(pattern: string, data?: unknown, options?: SendOptions): Promise<T>;

  /**
   * Emit a fire-and-forget event
   */
  emit(pattern: string, data?: unknown, options?: EmitOptions): Promise<void>;

  /**
   * Gracefully shut down: stop consuming, drain in-flight handlers,
   * reject pending sends, release connections.
   */
  destroy(options?: DestroyOptions): Promise<void>;
}
