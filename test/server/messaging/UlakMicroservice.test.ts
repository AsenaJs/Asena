import { describe, expect, test, beforeEach } from 'bun:test';
import { Ulak, ulak } from '../../../lib/server/messaging';
import { UlakError, UlakErrorCode } from '../../../lib/server/messaging';
import { InMemoryTransport, DEFAULT_TRANSPORT_NAME } from '../../../lib/server/microservice';
import { ICoreServiceNames } from '../../../lib/ioc';
import type { MessagingInterceptor } from '../../../lib/server/microservice';

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

function createUlak(): Ulak {
  const instance = new Ulak();

  (instance as any).logger = mockLogger;

  return instance;
}

describe('Ulak Microservice Messaging', () => {
  let broker: Ulak;
  let transport: InMemoryTransport;

  beforeEach(() => {
    broker = createUlak();
    transport = new InMemoryTransport();
    broker.setMicroserviceTransports(new Map([[DEFAULT_TRANSPORT_NAME, transport]]));
  });

  describe('No Transport', () => {
    test('should throw NO_TRANSPORT when nothing configured', async () => {
      const empty = createUlak();

      try {
        await empty.send('order.create', {});
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
        expect((error as UlakError).code).toBe(UlakErrorCode.NO_TRANSPORT);
      }
    });

    test('should throw TRANSPORT_NOT_FOUND for unknown named transport', async () => {
      try {
        await broker.send('order.create', {}, { transport: 'nats' });
        expect.unreachable();
      } catch (error) {
        expect((error as UlakError).code).toBe(UlakErrorCode.TRANSPORT_NOT_FOUND);
        expect((error as UlakError).message).toContain('default');
      }
    });
  });

  describe('send/emit delegation', () => {
    test('should reject empty patterns before reaching the transport', async () => {
      await expect(broker.send('')).rejects.toThrow(/empty/);
      await expect(broker.emit('')).rejects.toThrow(/empty/);
    });

    test('should route send to the default transport', async () => {
      transport.registerMessageHandler('order.create', async (data) => ({ ok: true, ...data }));

      const result = await broker.send<{ ok: boolean }>('order.create', { total: 5 });

      expect(result).toEqual({ ok: true, total: 5 } as any);
    });

    test('should route emit to the default transport', async () => {
      let received: any;

      transport.registerEventHandler('order.created', async (data) => {
        received = data;
      });

      await broker.emit('order.created', { id: 1 });

      expect(received).toEqual({ id: 1 });
    });

    test('should route to named transports', async () => {
      const analytics = new InMemoryTransport();

      analytics.registerMessageHandler('metrics.query', async () => 'from-analytics');

      broker.setMicroserviceTransports(
        new Map([
          [DEFAULT_TRANSPORT_NAME, transport],
          ['analytics', analytics],
        ]),
      );

      const result = await broker.send('metrics.query', {}, { transport: 'analytics' });

      expect(result).toBe('from-analytics');
    });
  });

  describe('messages() scoped view', () => {
    test('should join prefix with pattern', async () => {
      let seenPattern = '';

      transport.registerMessageHandler('order.create', async (_data, context) => {
        seenPattern = context.pattern;
        return null;
      });

      const orders = broker.messages('order');

      await orders.send('create', {});

      expect(seenPattern).toBe('order.create');
      expect(orders.prefix).toBe('order');
    });

    test('should pass pattern through without prefix', async () => {
      transport.registerMessageHandler('ping', async () => 'pong');

      const root = broker.messages();

      expect(await root.send('ping')).toBe('pong');
    });

    test('should scope emit to prefix', async () => {
      let seenPattern = '';

      transport.registerEventHandler('order.created', async (_data, context) => {
        seenPattern = context.pattern;
      });

      await broker.messages('order').emit('created', {});

      expect(seenPattern).toBe('order.created');
    });

    test('should carry named transport selection', async () => {
      const analytics = new InMemoryTransport();
      let called = false;

      analytics.registerEventHandler('metrics.tick', async () => {
        called = true;
      });

      broker.setMicroserviceTransports(
        new Map([
          [DEFAULT_TRANSPORT_NAME, transport],
          ['analytics', analytics],
        ]),
      );

      await broker.messages('metrics', { transport: 'analytics' }).emit('tick');

      expect(called).toBe(true);
    });
  });

  describe('Interceptors', () => {
    test('should run onSend interceptors in registration order and mutate headers', async () => {
      const order: string[] = [];
      let seenHeaders: Record<string, string> = {};

      transport.registerMessageHandler('order.create', async (_data, context) => {
        seenHeaders = context.headers;
        return null;
      });

      const first: MessagingInterceptor = {
        onSend: async (ctx, next) => {
          order.push('first:before');
          ctx.headers['traceparent'] = 'trace-123';

          const result = await next();

          order.push('first:after');

          return result;
        },
      };

      const second: MessagingInterceptor = {
        onSend: async (ctx, next) => {
          order.push('second:before');

          const result = await next();

          order.push('second:after');

          return result;
        },
      };

      broker.setMicroserviceTransports(new Map([[DEFAULT_TRANSPORT_NAME, transport]]), [first, second]);

      await broker.send('order.create', {});

      expect(order).toEqual(['first:before', 'second:before', 'second:after', 'first:after']);
      expect(seenHeaders['traceparent']).toBe('trace-123');
    });

    test('should give onSend the kind and observe errors', async () => {
      let observedKind = '';
      let observedError: Error | undefined;

      const interceptor: MessagingInterceptor = {
        onSend: async (ctx, next) => {
          observedKind = ctx.kind;

          try {
            return await next();
          } catch (error) {
            observedError = error as Error;
            throw error;
          }
        },
      };

      transport.registerMessageHandler('order.fail', async () => {
        throw new Error('boom');
      });

      broker.setMicroserviceTransports(new Map([[DEFAULT_TRANSPORT_NAME, transport]]), [interceptor]);

      await expect(broker.send('order.fail')).rejects.toThrow();

      try {
        await broker.send('order.fail');
      } catch {
        // expected
      }

      expect(observedKind).toBe('send');
      expect(observedError).toBeInstanceOf(UlakError);
    });
  });

  describe('Connection reporting', () => {
    test('should report connected transport', () => {
      expect(broker.isMicroserviceConnected()).toBe(true);
      expect(broker.isMicroserviceConnected('unknown')).toBe(false);
    });

    test('should expose transports for health reporting', () => {
      const transports = broker.getMicroserviceTransports();

      expect(transports.size).toBe(1);
      expect(transports.get(DEFAULT_TRANSPORT_NAME)).toBe(transport);
    });
  });

  describe('ulak.messages helper', () => {
    test('should return an inject tuple targeting Ulak', () => {
      const tuple = ulak.messages('order');

      expect(tuple[0]).toBe(ICoreServiceNames.__ULAK__);
      expect(typeof tuple[1]).toBe('function');
    });

    test('should produce a scoped messages view from the tuple expression', async () => {
      transport.registerMessageHandler('order.create', async () => 'created');

      const tuple = ulak.messages('order');
      const scoped = tuple[1](broker);

      expect(await scoped.send('create')).toBe('created');
    });

    test('should keep the websocket namespace helper intact', () => {
      const tuple = ulak('/chat');

      expect(tuple[0]).toBe(ICoreServiceNames.__ULAK__);
      expect(typeof tuple[1]).toBe('function');
    });
  });
});
