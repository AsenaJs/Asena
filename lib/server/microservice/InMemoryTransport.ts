import { UlakError, UlakErrorCode } from '../messaging/types';
import { PatternHandlerIndex } from '../event/PatternHandlerIndex';
import type {
  EmitOptions,
  EventPatternHandler,
  MessageContext,
  MessageHandler,
  MicroserviceTransport,
  SendOptions,
} from './MicroserviceTransport';

/**
 * @description Zero-dependency in-process microservice transport.
 *
 * Messages never leave the process — send/emit dispatch directly to handlers
 * registered in the same application. Useful as:
 * - a development mode before a broker is available
 * - a test double for @MessageController integration tests
 * - the reference implementation of the MicroserviceTransport SPI
 *
 * Delivery semantics: synchronous at-most-once, attempt is always 1.
 *
 * @example
 * @Config()
 * export class AppConfig extends ConfigService {
 *   transport() {
 *     return { microservice: new InMemoryTransport() };
 *   }
 * }
 */
export class InMemoryTransport implements MicroserviceTransport {
  public readonly name = 'in-memory';

  /**
   * Exact request pattern -> handler (request/response requires exact routing)
   */
  private messageHandlers = new Map<string, MessageHandler>();

  /**
   * Event handler index (shared hybrid exact/wildcard implementation)
   */
  private eventHandlers = new PatternHandlerIndex<EventPatternHandler>();

  /**
   * Monotonic counter used to build message ids
   */
  private sequence = 0;

  public readonly isConnected = true;

  public async init(): Promise<void> {
    // Nothing to connect - in-process only
  }

  public registerMessageHandler(pattern: string, handler: MessageHandler): void {
    // Validate the FINAL pattern: the decorator only sees the raw method
    // pattern, so a wildcard or emptiness introduced by the @MessageController
    // prefix would otherwise slip through
    if (!pattern) {
      throw new Error('Message pattern cannot be empty - check @MessagePattern and the @MessageController prefix');
    }

    if (pattern.includes('*')) {
      throw new Error(
        `Message pattern "${pattern}" cannot contain wildcards - request/response requires exact routing ` +
          '(a wildcard likely leaked in via the @MessageController prefix - remove it, or set ' +
          'prefix: false on the @MessagePattern)',
      );
    }

    if (this.messageHandlers.has(pattern)) {
      throw new Error(`Duplicate @MessagePattern('${pattern}') - a message pattern can only have one handler`);
    }

    this.messageHandlers.set(pattern, handler);
  }

  public registerEventHandler(pattern: string, handler: EventPatternHandler): void {
    if (!pattern) {
      throw new Error('Event pattern cannot be empty - check @EventPattern and the @MessageController prefix');
    }

    this.eventHandlers.add(pattern, handler);
  }

  public async listen(): Promise<void> {
    // Nothing to consume - handlers are invoked directly by send/emit
  }

  public async send<T = unknown>(pattern: string, data?: unknown, options?: SendOptions): Promise<T> {
    const handler = this.messageHandlers.get(pattern);

    if (!handler) {
      throw new UlakError(`No message handler registered for pattern "${pattern}"`, UlakErrorCode.SEND_FAILED);
    }

    const context = this.createContext(pattern, crypto.randomUUID(), options?.headers);

    const invocation = Promise.resolve().then(() => handler(data, context));

    try {
      const result = options?.timeout ? await this.withTimeout(invocation, options.timeout, pattern) : await invocation;

      return result as T;
    } catch (error) {
      if (error instanceof UlakError) {
        throw error;
      }

      throw new UlakError(
        `Handler for pattern "${pattern}" failed: ${(error as Error).message}`,
        UlakErrorCode.REMOTE_ERROR,
        undefined,
        error as Error,
      );
    }
  }

  public async emit(pattern: string, data?: unknown, options?: EmitOptions): Promise<void> {
    const handlers = this.eventHandlers.collect(pattern);

    // One context per emit: every handler of the same event must observe the
    // SAME messageId (as in Redis, where all handlers see the entry id) - the
    // documented messageId-dedup recipe relies on this
    const context = this.createContext(pattern, undefined, options?.headers);

    // Fire-and-forget: handler failures must not reach the emitter
    await Promise.allSettled(handlers.map((handler) => Promise.resolve().then(() => handler(data, context))));
  }

  public async destroy(): Promise<void> {
    this.messageHandlers.clear();
    this.eventHandlers.clear();
  }

  private createContext(pattern: string, correlationId?: string, headers?: Record<string, string>): MessageContext {
    return {
      pattern,
      messageId: `mem-${++this.sequence}`,
      correlationId,
      headers: { ...headers },
      timestamp: Date.now(),
      attempt: 1,
    };
  }

  private withTimeout<T>(promise: Promise<T>, timeout: number, pattern: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new UlakError(`Request "${pattern}" timed out after ${timeout}ms`, UlakErrorCode.TIMEOUT));
      }, timeout);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
