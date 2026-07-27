import type { Container, ICoreService } from '../../../ioc';
import { ComponentConstants, ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';
import { getChainedTypedMetadata, getOwnTypedMetadata, getTypedMetadata } from '../../../utils';
import { blue, type ServerLogger, yellow } from '../../../logger';
import { DEFAULT_TRANSPORT_NAME } from '../../microservice';
import { composeOnReceive } from '../../microservice';
import type { Ulak } from '../../messaging';
import type { MessageHandlerMetadata, MessagingInterceptor } from '../../microservice';
import type { DestroyOptions, MessageContext, MicroserviceTransport } from '../../microservice';

/**
 * @description PrepareMicroserviceService - Registers microservice message handlers during bootstrap
 *
 * Scan Process:
 * 1. Resolve all ComponentType.MESSAGE_CONTROLLER from container
 * 2. Extract prefix + transport binding metadata from class
 * 3. Extract handler metadata (@MessagePattern/@EventPattern methods)
 * 4. Build final pattern: the controller prefix is joined onto BOTH message and event
 *    patterns, unless the handler opted out with prefix: false
 * 5. Bind method to instance, wrap with interceptor onReceive chain
 * 6. Register into the bound transport, then init() + listen() every transport
 * 7. Wire transports into Ulak (send/emit client side)
 *
 * Rules:
 * - Controllers found but no transport configured → throw (fail fast)
 * - Transport configured but no controllers → still init + wire Ulak (client-only mode);
 *   the transport contract guarantees no consumer loop starts with zero handlers
 * - Controller bound to an unknown named transport → throw listing available names
 * - A handler with prefix: false registers its pattern verbatim (external topics,
 *   another service's event vocabulary, global catch-alls)
 * - A prefix containing '*' is a boot error - the prefix must be a literal path segment
 */
@CoreService(ICoreServiceNames.PREPARE_MICROSERVICE_SERVICE)
export class PrepareMicroserviceService implements ICoreService {
  public readonly serviceName = 'PrepareMicroserviceService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger!: ServerLogger;

  @Inject(ICoreServiceNames.__ULAK__)
  private ulak!: Ulak;

  private transports: Map<string, MicroserviceTransport> = new Map();

  /**
   * Prepare microservice handlers - Called during bootstrap (before the HTTP adapter starts)
   *
   * @param transports - Named transports from the transport() config hook
   * @param interceptors - Messaging interceptors applied to all transports
   */
  public async prepare(
    transports: Map<string, MicroserviceTransport> = new Map(),
    interceptors: MessagingInterceptor[] = [],
  ): Promise<void> {
    const controllers = await this.container.resolveAll<any>(ComponentType.MESSAGE_CONTROLLER);
    const hasControllers = controllers !== null && controllers.length > 0;

    if (transports.size === 0) {
      if (hasControllers) {
        throw new Error(
          '@MessageController components found but no microservice transport configured - configure a microservice transport in your @Config transport()',
        );
      }

      // No transports, no controllers - nothing to do
      return;
    }

    this.transports = transports;

    if (hasControllers) {
      // Shared across controllers: two @MessageControllers can resolve to the same
      // request/response pattern on the same transport just as easily as one can.
      const registeredMessagePatterns = new Map<string, { controllerName: string; handlerName: string }>();

      for (const controller of controllers) {
        this.registerController(controller, interceptors, registeredMessagePatterns);
      }
    }

    // Connect and start consuming (transports with zero handlers start no consumer)
    for (const [name, transport] of transports) {
      await transport.init();
      await transport.listen();

      this.logger.info(`${blue('[Microservice]')} Transport "${name}" (${transport.name}) ready`);
    }

    // Wire the client side (Ulak.send/emit)
    this.ulak.setMicroserviceTransports(transports, interceptors);
  }

  /**
   * Gracefully shut down all transports - Called from AsenaServer.stop()
   */
  public async destroy(options?: DestroyOptions): Promise<void> {
    for (const [name, transport] of this.transports) {
      try {
        await transport.destroy(options);
      } catch (error) {
        this.logger.error(`${blue('[Microservice]')} Transport "${name}" destroy failed`, error);
      }
    }

    this.transports = new Map();
  }

  /**
   * Report handlers a message controller picked up from its base classes
   *
   * Worth a line of its own: an inherited @EventPattern opens a real broker subscription,
   * and that is not visible in the source of the controller you are reading. Silent when the
   * controller declares all of its own handlers.
   */
  private logInheritedHandlers(
    controller: any,
    controllerName: string,
    handlers: Record<string, MessageHandlerMetadata>,
  ): void {
    const own = getOwnTypedMetadata<Record<string, MessageHandlerMetadata>>(
      ComponentConstants.MessageHandlersKey,
      controller.constructor,
    );
    const inherited = Object.keys(handlers).filter((methodName) => !(methodName in (own || {})));

    if (inherited.length === 0) {
      return;
    }

    this.logger.info(`${blue('[Microservice]')} ${controllerName} inherits handlers: ${inherited.join(', ')}`);
  }

  /**
   * Register all handlers from a single message controller
   */
  private registerController(
    controller: any,
    interceptors: MessagingInterceptor[],
    registeredMessagePatterns: Map<string, { controllerName: string; handlerName: string }>,
  ): void {
    const prefix = getTypedMetadata<string>(ComponentConstants.MessagePrefixKey, controller.constructor) || '';

    const transportName =
      getTypedMetadata<string>(ComponentConstants.MessageTransportKey, controller.constructor) ||
      DEFAULT_TRANSPORT_NAME;

    const transport = this.transports.get(transportName);

    if (!transport) {
      const available = Array.from(this.transports.keys()).join(', ');

      throw new Error(
        `@MessageController "${controller.constructor.name}" is bound to transport "${transportName}" but it is not configured - available transports: ${available}`,
      );
    }

    // Chained, not plain getTypedMetadata: the pattern decorators write to the class
    // declaring the method, and reading the nearest ancestor's record whole meant one
    // @MessagePattern on the subclass shadowed every handler it inherited.
    const handlers = getChainedTypedMetadata<Record<string, MessageHandlerMetadata>>(
      ComponentConstants.MessageHandlersKey,
      controller.constructor,
    );

    if (Object.keys(handlers).length === 0) {
      // No @MessagePattern/@EventPattern methods - skip
      return;
    }

    const controllerName = controller.constructor.name;

    this.logInheritedHandlers(controller, controllerName, handlers);

    const resolved: { kind: 'msg' | 'evt'; pattern: string }[] = [];

    for (const [methodName, metadata] of Object.entries(handlers)) {
      if (metadata.skip) {
        continue;
      }

      // `!== false`: metadata written by a pre-0.8 decorator build carries no
      // flag and must follow the current default (apply the prefix)
      const applyPrefix = metadata.prefix !== false;

      // A wildcard prefix is nonsense in every direction: it produced a loud
      // transport error on the message side and would now silently produce a
      // bizarre event subscription ('order.*.created')
      if (applyPrefix && prefix.includes('*')) {
        throw new Error(
          `@MessageController "${controller.constructor.name}" has a wildcard prefix "${prefix}" - ` +
            'the prefix is joined onto @MessagePattern and @EventPattern patterns and must be a literal ' +
            'path segment (use prefix: false on a handler that must keep its pattern verbatim)',
        );
      }

      const bound = controller[methodName].bind(controller);

      const wrapped = (data: any, context: MessageContext) =>
        composeOnReceive(interceptors, context, () => Promise.resolve(bound(data, context)));

      const finalPattern = this.buildPattern(prefix, metadata.pattern, applyPrefix);

      if (metadata.type === 'message') {
        // Request/response: a second handler on the same pattern is ambiguous - nothing
        // decides which one produces the reply. Events are exempt, where several
        // subscribers on one pattern is the point.
        const patternKey = `${transportName} ${finalPattern}`;
        const existing = registeredMessagePatterns.get(patternKey);

        if (existing) {
          throw new Error(
            `Duplicate message pattern detected: "${finalPattern}" on transport "${transportName}" — ` +
              `already registered by ${existing.controllerName}.${existing.handlerName}(), ` +
              `conflicts with ${controllerName}.${methodName}()`,
          );
        }

        registeredMessagePatterns.set(patternKey, { controllerName, handlerName: methodName });

        transport.registerMessageHandler(finalPattern, wrapped);
        resolved.push({ kind: 'msg', pattern: finalPattern });
      } else {
        transport.registerEventHandler(finalPattern, wrapped);
        resolved.push({ kind: 'evt', pattern: finalPattern });
      }
    }

    this.logResolved(controllerName, transportName, prefix, resolved);
  }

  /**
   * Build the final pattern from the controller prefix and the handler pattern
   *
   * Rules (identical for @MessagePattern and @EventPattern, and identical to
   * UlakMessages.buildPattern on the outbound side and PrepareEventService
   * .buildEventPattern for the in-process event system):
   * - Handler opted out (prefix: false) → pattern
   * - No prefix                         → pattern
   * - No pattern                        → prefix
   * - Both                              → prefix.pattern
   */
  private buildPattern(prefix: string, pattern: string, applyPrefix: boolean): string {
    if (!applyPrefix) return pattern;
    if (!prefix) return pattern;
    if (!pattern) return prefix;
    return `${prefix}.${pattern}`;
  }

  /**
   * Log one line per controller with the RESOLVED patterns
   *
   * Asena 0.8 changed the prefix rule for @EventPattern, so the joined result
   * must be visible at boot - but per-handler lines would drown the startup output.
   */
  private logResolved(
    controllerName: string,
    transportName: string,
    prefix: string,
    resolved: { kind: 'msg' | 'evt'; pattern: string }[],
  ): void {
    if (!resolved.length) {
      return;
    }

    const parts: string[] = [];
    const messages = resolved.filter((entry) => entry.kind === 'msg').map((entry) => entry.pattern);
    const events = resolved.filter((entry) => entry.kind === 'evt').map((entry) => entry.pattern);

    if (messages.length) parts.push(`msg: ${messages.join(', ')}`);
    if (events.length) parts.push(`evt: ${events.join(', ')}`);

    this.logger.info(
      `${blue('[Microservice]')} ${yellow(controllerName)} → "${transportName}"` +
        `${prefix ? ` (prefix "${prefix}")` : ''} ${parts.join(' | ')}`,
    );
  }
}
