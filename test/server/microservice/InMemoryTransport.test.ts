import { describe, expect, test, beforeEach } from 'bun:test';
import { InMemoryTransport } from '../../../lib/server/microservice';
import { UlakError, UlakErrorCode } from '../../../lib/server/messaging';

describe('InMemoryTransport', () => {
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.init();
    await transport.listen();
  });

  describe('Request/Response', () => {
    test('should deliver request and return handler result', async () => {
      transport.registerMessageHandler('order.create', async (data) => ({ id: 1, ...data }));

      const result = await transport.send<{ id: number; total: number }>('order.create', { total: 42 });

      expect(result).toEqual({ id: 1, total: 42 });
    });

    test('should pass message context to handler', async () => {
      let received: any;

      transport.registerMessageHandler('order.get', async (_data, context) => {
        received = context;
        return null;
      });

      await transport.send('order.get', {}, { headers: { 'x-user': 'libir' } });

      expect(received.pattern).toBe('order.get');
      expect(received.messageId).toStartWith('mem-');
      expect(received.correlationId).toBeDefined();
      expect(received.headers['x-user']).toBe('libir');
      expect(received.attempt).toBe(1);
    });

    test('should throw SEND_FAILED when no handler is registered', async () => {
      await expect(transport.send('missing.pattern')).rejects.toThrow(UlakError);

      try {
        await transport.send('missing.pattern');
      } catch (error) {
        expect((error as UlakError).code).toBe(UlakErrorCode.SEND_FAILED);
      }
    });

    test('should wrap handler errors as REMOTE_ERROR', async () => {
      transport.registerMessageHandler('order.fail', async () => {
        throw new Error('boom');
      });

      try {
        await transport.send('order.fail');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
        expect((error as UlakError).code).toBe(UlakErrorCode.REMOTE_ERROR);
        expect((error as UlakError).cause?.message).toBe('boom');
      }
    });

    test('should reject with TIMEOUT when handler exceeds timeout', async () => {
      transport.registerMessageHandler('order.slow', () => new Promise((resolve) => setTimeout(resolve, 200)));

      try {
        await transport.send('order.slow', {}, { timeout: 20 });
        expect.unreachable();
      } catch (error) {
        expect((error as UlakError).code).toBe(UlakErrorCode.TIMEOUT);
      }
    });

    test('should throw on duplicate message pattern registration', () => {
      transport.registerMessageHandler('order.create', async () => null);

      expect(() => transport.registerMessageHandler('order.create', async () => null)).toThrow(/Duplicate/);
    });

    test('should reject empty and wildcard final message patterns', () => {
      expect(() => transport.registerMessageHandler('', async () => null)).toThrow(/empty/);
      expect(() => transport.registerMessageHandler('order.*.create', async () => null)).toThrow(/wildcard/);
    });
  });

  describe('Events', () => {
    test('should deliver event to exact pattern handler', async () => {
      let received: any;

      transport.registerEventHandler('payment.completed', async (data) => {
        received = data;
      });

      await transport.emit('payment.completed', { orderId: 7 });

      expect(received).toEqual({ orderId: 7 });
    });

    test('should deliver event to wildcard handlers', async () => {
      const calls: string[] = [];

      transport.registerEventHandler('payment.*', async (_data, context) => {
        calls.push(`wildcard:${context.pattern}`);
      });

      transport.registerEventHandler('payment.completed', async (_data, context) => {
        calls.push(`exact:${context.pattern}`);
      });

      await transport.emit('payment.completed', {});
      await transport.emit('payment.failed', {});

      expect(calls).toContain('exact:payment.completed');
      expect(calls).toContain('wildcard:payment.completed');
      expect(calls).toContain('wildcard:payment.failed');
      expect(calls).toHaveLength(3);
    });

    test('should allow multiple handlers on same event pattern', async () => {
      let count = 0;

      transport.registerEventHandler('stock.depleted', async () => {
        count++;
      });

      transport.registerEventHandler('stock.depleted', async () => {
        count++;
      });

      await transport.emit('stock.depleted');

      expect(count).toBe(2);
    });

    test('should give every handler of one emit the same messageId', async () => {
      // The messageId-dedup recipe relies on this - Redis delivers one entry
      // id to all handlers, so the in-memory transport must match
      const ids: string[] = [];

      transport.registerEventHandler('stock.depleted', async (_data, context) => {
        ids.push(context.messageId);
      });

      transport.registerEventHandler('stock.*', async (_data, context) => {
        ids.push(context.messageId);
      });

      await transport.emit('stock.depleted');

      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(ids[1]);
    });

    test('should reject an empty event pattern', () => {
      expect(() => transport.registerEventHandler('', async () => {})).toThrow(/empty/);
    });

    test('should not propagate event handler errors to emitter', async () => {
      transport.registerEventHandler('payment.completed', async () => {
        throw new Error('handler failure');
      });

      // Fire-and-forget: must not throw
      await transport.emit('payment.completed');
    });

    test('should be a no-op when no handler matches', async () => {
      await transport.emit('nobody.listens');
    });
  });

  describe('Lifecycle', () => {
    test('should report connected', () => {
      expect(transport.isConnected).toBe(true);
    });

    test('should clear handlers on destroy', async () => {
      transport.registerMessageHandler('order.create', async () => null);

      await transport.destroy();

      await expect(transport.send('order.create')).rejects.toThrow(/No message handler/);
    });
  });
});
