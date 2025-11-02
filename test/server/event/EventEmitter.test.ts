import { describe, expect, test, beforeEach } from 'bun:test';
import { EventEmitter } from '../../../lib/server/event';
import { EventDispatchService } from '../../../lib/server/event';
import type { EventHandler } from '../../../lib/server/event';

describe('EventEmitter', () => {
  let emitter: EventEmitter;
  let dispatcher: EventDispatchService;

  beforeEach(() => {
    // Create instances manually for testing
    emitter = new EventEmitter();
    dispatcher = new EventDispatchService();

    // Manually inject dispatcher (simulating DI)
    (emitter as any).dispatcher = dispatcher;
  });

  describe('emit', () => {
    test('should emit event to registered handlers', () => {
      let called = false;
      const handler: EventHandler = () => {
        called = true;
      };

      dispatcher.registerHandler('user.created', handler);
      const result = emitter.emit('user.created');

      expect(result).toBe(true);
      expect(called).toBe(true);
    });

    test('should pass event name and data to handlers', () => {
      let receivedEvent = '';
      let receivedData: any = null;

      const handler: EventHandler = (eventName, data) => {
        receivedEvent = eventName;
        receivedData = data;
      };

      dispatcher.registerHandler('user.created', handler);
      emitter.emit('user.created', { id: 123, name: 'John' });

      expect(receivedEvent).toBe('user.created');
      expect(receivedData).toEqual({ id: 123, name: 'John' });
    });

    test('should return false if no handlers match', () => {
      const result = emitter.emit('nonexistent.event');
      expect(result).toBe(false);
    });

    test('should emit to wildcard handlers', () => {
      let count = 0;
      const handler: EventHandler = () => {
        count++;
      };

      dispatcher.registerHandler('user.*', handler);

      emitter.emit('user.created');
      emitter.emit('user.updated');
      emitter.emit('user.deleted');

      expect(count).toBe(3);
    });

    test('should emit to all wildcard (*) handler', () => {
      let count = 0;
      const handler: EventHandler = () => {
        count++;
      };

      dispatcher.registerHandler('*', handler);

      emitter.emit('user.created');
      emitter.emit('download.complete');
      emitter.emit('app.started');

      expect(count).toBe(3);
    });

    test('should fire-and-forget (not wait for async handlers)', async () => {
      let asyncCompleted = false;

      const asyncHandler: EventHandler = async () => {
        await Bun.sleep(10);
        asyncCompleted = true;
      };

      dispatcher.registerHandler('user.created', asyncHandler);
      const result = emitter.emit('user.created');

      // Should return immediately
      expect(result).toBe(true);
      expect(asyncCompleted).toBe(false);

      // Wait for async handler
      await Bun.sleep(20);
      expect(asyncCompleted).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complex event patterns', () => {
      let exactCount = 0;
      let prefixCount = 0;
      let suffixCount = 0;
      let allCount = 0;

      const exactHandler: EventHandler = () => {
        exactCount++;
      };
      const prefixHandler: EventHandler = () => {
        prefixCount++;
      };
      const suffixHandler: EventHandler = () => {
        suffixCount++;
      };
      const allHandler: EventHandler = () => {
        allCount++;
      };

      dispatcher.registerHandler('user.created', exactHandler);
      dispatcher.registerHandler('user.*', prefixHandler);
      dispatcher.registerHandler('*.created', suffixHandler);
      dispatcher.registerHandler('*', allHandler);

      emitter.emit('user.created');

      expect(exactCount).toBe(1);
      expect(prefixCount).toBe(1);
      expect(suffixCount).toBe(1);
      expect(allCount).toBe(1);
    });

    test('should handle event-driven workflow', () => {
      const events: string[] = [];

      const userHandler: EventHandler = (eventName) => {
        events.push(eventName);

        // Emit another event from handler
        if (eventName === 'user.created') {
          emitter.emit('email.send', { to: 'user@example.com' });
        }
      };

      const emailHandler: EventHandler = (eventName) => {
        events.push(eventName);
      };

      dispatcher.registerHandler('user.*', userHandler);
      dispatcher.registerHandler('email.*', emailHandler);

      emitter.emit('user.created', { id: 123 });

      expect(events).toContain('user.created');
      expect(events).toContain('email.send');
    });

    test('should handle error in one handler without affecting others', () => {
      let handler2Called = false;

      const errorHandler: EventHandler = () => {
        throw new Error('Handler error');
      };

      const normalHandler: EventHandler = () => {
        handler2Called = true;
      };

      dispatcher.registerHandler('user.created', errorHandler);
      dispatcher.registerHandler('user.created', normalHandler);

      // Should not throw
      emitter.emit('user.created');

      expect(handler2Called).toBe(true);
    });

    test('should handle mixed sync and async handlers', async () => {
      let syncCalled = false;
      let asyncCalled = false;

      const syncHandler: EventHandler = () => {
        syncCalled = true;
      };

      const asyncHandler: EventHandler = async () => {
        await Bun.sleep(10);
        asyncCalled = true;
      };

      dispatcher.registerHandler('user.created', syncHandler);
      dispatcher.registerHandler('user.created', asyncHandler);

      emitter.emit('user.created');

      expect(syncCalled).toBe(true);
      expect(asyncCalled).toBe(false); // Not yet

      await Bun.sleep(20);
      expect(asyncCalled).toBe(true);
    });
  });
});
