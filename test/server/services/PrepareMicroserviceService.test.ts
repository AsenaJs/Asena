import { describe, expect, test, beforeEach } from 'bun:test';
import { PrepareMicroserviceService } from '../../../lib/server/src/services/PrepareMicroserviceService';
import { ComponentConstants, Container } from '../../../lib/ioc';
import { defineTypedMetadata } from '../../../lib/utils';
import { Ulak } from '../../../lib/server/messaging';
import { MessageController } from '../../../lib/server/decorators';
import {
  EventPattern,
  InMemoryTransport,
  MessagePattern,
  DEFAULT_TRANSPORT_NAME,
} from '../../../lib/server/microservice';
import type { MessagingInterceptor } from '../../../lib/server/microservice';

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe('PrepareMicroserviceService', () => {
  let prepareService: PrepareMicroserviceService;
  let container: Container;
  let broker: Ulak;
  let transport: InMemoryTransport;

  beforeEach(() => {
    container = new Container();
    broker = new Ulak();
    (broker as any).logger = mockLogger;

    transport = new InMemoryTransport();

    prepareService = new PrepareMicroserviceService();
    (prepareService as any).container = container;
    (prepareService as any).logger = mockLogger;
    (prepareService as any).ulak = broker;
  });

  function transports(map: Record<string, InMemoryTransport> = { [DEFAULT_TRANSPORT_NAME]: transport }) {
    return new Map(Object.entries(map));
  }

  describe('Handler Registration', () => {
    test('should apply the controller prefix to both message and event patterns', async () => {
      const seen: string[] = [];

      @MessageController('order')
      class OrderHandler {
        @MessagePattern('create')
        async create(_data: any, context: any) {
          seen.push(`message:${context.pattern}`);
          return 'ok';
        }

        @EventPattern('payment.completed')
        async onPayment(_data: any, context: any) {
          seen.push(`event:${context.pattern}`);
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      // Message pattern gets the prefix
      expect(await transport.send('order.create', {})).toBe('ok');

      // Event pattern gets the prefix too
      await transport.emit('order.payment.completed', {});

      // The un-prefixed name no longer routes anywhere
      await transport.emit('payment.completed', {});

      expect(seen).toContain('message:order.create');
      expect(seen).toContain('event:order.payment.completed');
      expect(seen.filter((entry) => entry.startsWith('event:'))).toHaveLength(1);
    });

    test('should register an event handler verbatim when it opts out of the prefix', async () => {
      const seen: string[] = [];

      @MessageController('order')
      class OrderHandler {
        @EventPattern({ pattern: 'payment.completed', prefix: false })
        async onPayment(_data: any, context: any) {
          seen.push(context.pattern);
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      await transport.emit('payment.completed', {});
      await transport.emit('order.payment.completed', {});

      expect(seen).toEqual(['payment.completed']);
    });

    test('should register a message handler verbatim when it opts out of the prefix', async () => {
      @MessageController('order')
      class OrderHandler {
        @MessagePattern({ pattern: 'ping', prefix: false })
        async ping() {
          return 'pong';
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      expect(await transport.send('ping')).toBe('pong');
      await expect(transport.send('order.ping')).rejects.toThrow(/No message handler/);
    });

    test('should join the prefix onto wildcard event patterns', async () => {
      const seen: string[] = [];

      @MessageController('order')
      class OrderHandler {
        @EventPattern('*')
        async onAny(_data: any, context: any) {
          seen.push(context.pattern);
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      await transport.emit('order.created', {});
      // A trailing wildcard consumes all remaining segments
      await transport.emit('order.item.added', {});
      // A wildcard requires at least one segment, so the bare prefix misses
      await transport.emit('order', {});
      await transport.emit('payment.completed', {});

      expect(seen).toEqual(['order.created', 'order.item.added']);
    });

    test('should keep a global catch-all global with prefix: false', async () => {
      const seen: string[] = [];

      @MessageController('order')
      class OrderHandler {
        @EventPattern({ pattern: '*', prefix: false })
        async onAny(_data: any, context: any) {
          seen.push(context.pattern);
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      await transport.emit('payment.completed', {});
      await transport.emit('order.created', {});

      expect(seen).toEqual(['payment.completed', 'order.created']);
    });

    test('should register the bare prefix for an empty event pattern', async () => {
      const seen: string[] = [];

      @MessageController('order')
      class OrderHandler {
        @EventPattern('')
        async onOrder(_data: any, context: any) {
          seen.push(context.pattern);
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      await transport.emit('order', {});

      expect(seen).toEqual(['order']);
    });

    test('should reject an empty final event pattern', async () => {
      @MessageController()
      class GlobalHandler {
        @EventPattern('')
        async onAnything() {}
      }

      await container.registerInstance('GlobalHandler', new GlobalHandler());

      await expect(prepareService.prepare(transports())).rejects.toThrow(/Event pattern cannot be empty/);
    });

    test('should reject a wildcard controller prefix at boot', async () => {
      @MessageController('order.*')
      class OrderHandler {
        @EventPattern('created')
        async onCreated() {}
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await expect(prepareService.prepare(transports())).rejects.toThrow(/wildcard prefix/);
      await expect(prepareService.prepare(transports())).rejects.toThrow(/OrderHandler/);
    });

    test('should apply the prefix when metadata carries no prefix flag', async () => {
      // Metadata written by a pre-0.8 decorator build has no `prefix` key -
      // it must follow the current default rather than silently keeping 0.7 behavior
      const seen: string[] = [];

      @MessageController('order')
      class LegacyHandler {
        async onCreated(_data: any, context: any) {
          seen.push(context.pattern);
        }
      }

      defineTypedMetadata(
        ComponentConstants.MessageHandlersKey,
        {
          onCreated: { pattern: 'created', type: 'event', methodName: 'onCreated', skip: false },
        },
        LegacyHandler,
      );

      await container.registerInstance('LegacyHandler', new LegacyHandler());

      await prepareService.prepare(transports());

      await transport.emit('order.created', {});

      expect(seen).toEqual(['order.created']);
    });

    test('should register patterns without prefix as-is', async () => {
      @MessageController()
      class GlobalHandler {
        @MessagePattern('ping')
        async ping() {
          return 'pong';
        }
      }

      await container.registerInstance('GlobalHandler', new GlobalHandler());

      await prepareService.prepare(transports());

      expect(await transport.send('ping')).toBe('pong');
    });

    test('should skip handlers marked with skip', async () => {
      @MessageController('order')
      class OrderHandler {
        @MessagePattern({ pattern: 'create', skip: true })
        async create() {
          return 'should-not-run';
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      await expect(transport.send('order.create')).rejects.toThrow(/No message handler/);
    });

    test('should bind handlers to the controller instance', async () => {
      @MessageController('order')
      class OrderHandler {
        public prefix = 'instance-state';

        @MessagePattern('state')
        async state() {
          return this.prefix;
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      expect(await transport.send('order.state')).toBe('instance-state');
    });

    test('should wire Ulak with the transports', async () => {
      @MessageController()
      class Handler {
        @MessagePattern('ping')
        async ping() {
          return 'pong';
        }
      }

      await container.registerInstance('Handler', new Handler());

      await prepareService.prepare(transports());

      expect(await broker.send('ping')).toBe('pong');
      expect(broker.isMicroserviceConnected()).toBe(true);
    });
  });

  describe('Resolved Pattern Logging', () => {
    function capturingLogger() {
      const lines: string[] = [];

      return { lines, logger: { info: (msg: string) => lines.push(msg), warn: () => {}, error: () => {} } as any };
    }

    test('should log the resolved patterns once per controller', async () => {
      const { lines, logger } = capturingLogger();

      (prepareService as any).logger = logger;

      @MessageController('order')
      class OrderHandler {
        @MessagePattern('create')
        async create() {
          return 'ok';
        }

        @EventPattern('payment.completed')
        async onPayment() {}
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports());

      const controllerLines = lines.filter((line) => line.includes('OrderHandler'));

      expect(controllerLines).toHaveLength(1);
      expect(controllerLines[0]).toContain('order.create');
      expect(controllerLines[0]).toContain('order.payment.completed');
    });

    test('should not log a controller whose handlers are all skipped', async () => {
      const { lines, logger } = capturingLogger();

      (prepareService as any).logger = logger;

      @MessageController('order')
      class SkippedHandler {
        @MessagePattern({ pattern: 'create', skip: true })
        async create() {
          return 'ok';
        }
      }

      await container.registerInstance('SkippedHandler', new SkippedHandler());

      await prepareService.prepare(transports());

      expect(lines.filter((line) => line.includes('SkippedHandler'))).toHaveLength(0);
    });
  });

  describe('Named Transports', () => {
    test('should register controller into its named transport', async () => {
      const analytics = new InMemoryTransport();

      @MessageController({ prefix: 'metrics', transport: 'analytics' })
      class AnalyticsHandler {
        @MessagePattern('query')
        async query() {
          return 'analytics-result';
        }
      }

      await container.registerInstance('AnalyticsHandler', new AnalyticsHandler());

      await prepareService.prepare(transports({ [DEFAULT_TRANSPORT_NAME]: transport, analytics }));

      expect(await analytics.send('metrics.query')).toBe('analytics-result');
      await expect(transport.send('metrics.query')).rejects.toThrow(/No message handler/);
    });

    test('should fail fast for unknown named transport', async () => {
      @MessageController({ transport: 'nats' })
      class NatsHandler {
        @MessagePattern('ping')
        async ping() {
          return 'pong';
        }
      }

      await container.registerInstance('NatsHandler', new NatsHandler());

      await expect(prepareService.prepare(transports())).rejects.toThrow(/bound to transport "nats"/);
    });
  });

  describe('Fail Fast / Client-Only', () => {
    test('should throw when controllers exist without any transport', async () => {
      @MessageController()
      class Handler {
        @MessagePattern('ping')
        async ping() {
          return 'pong';
        }
      }

      await container.registerInstance('Handler', new Handler());

      await expect(prepareService.prepare()).rejects.toThrow(/no microservice transport configured/);
    });

    test('should reject a wildcard leaking into the final pattern via the controller prefix', async () => {
      // @MessagePattern rejects raw wildcards at decoration time, but the
      // controller prefix is joined later - the transport must veto the result
      @MessageController('order.*')
      class WildcardHandler {
        @MessagePattern('create')
        async create() {
          return 'x';
        }
      }

      await container.registerInstance('WildcardHandler', new WildcardHandler());

      await expect(prepareService.prepare(transports())).rejects.toThrow(/wildcard/);
    });

    test('should be a no-op without controllers and transports', async () => {
      await prepareService.prepare();
    });

    test('should still wire Ulak in client-only mode (transport, no controllers)', async () => {
      transport.registerMessageHandler('remote.echo', async (data) => data);

      await prepareService.prepare(transports());

      expect(await broker.send('remote.echo', 'hello')).toBe('hello');
    });
  });

  describe('Interceptors', () => {
    test('should wrap handlers with onReceive chain', async () => {
      const order: string[] = [];

      const interceptor: MessagingInterceptor = {
        onReceive: async (ctx, next) => {
          order.push(`before:${ctx.pattern}`);

          const result = await next();

          order.push(`after:${ctx.pattern}`);

          return result;
        },
      };

      @MessageController('order')
      class OrderHandler {
        @MessagePattern('create')
        async create() {
          order.push('handler');
          return 'ok';
        }
      }

      await container.registerInstance('OrderHandler', new OrderHandler());

      await prepareService.prepare(transports(), [interceptor]);

      expect(await transport.send('order.create')).toBe('ok');
      expect(order).toEqual(['before:order.create', 'handler', 'after:order.create']);
    });
  });

  describe('Destroy', () => {
    test('should destroy all transports', async () => {
      @MessageController()
      class Handler {
        @MessagePattern('ping')
        async ping() {
          return 'pong';
        }
      }

      await container.registerInstance('Handler', new Handler());

      await prepareService.prepare(transports());
      await prepareService.destroy();

      // InMemoryTransport.destroy clears handlers
      await expect(transport.send('ping')).rejects.toThrow(/No message handler/);
    });
  });
});
