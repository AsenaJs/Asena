import { describe, expect, test, beforeEach } from 'bun:test';
import { EventDispatchService } from '../../../lib/server/event';
import type { EventHandler } from '../../../lib/server/event';

describe('EventDispatchService', () => {
  let service: EventDispatchService;

  beforeEach(() => {
    service = new EventDispatchService();
  });

  describe('registerHandler', () => {
    test('should register a handler for exact pattern', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('user.created', handler);

      const handlers = service.getHandlers();
      expect(handlers).toHaveLength(1);
      expect(handlers[0].pattern).toBe('user.created');
      expect(handlers[0].handler).toBe(handler);
      expect(handlers[0].once).toBe(false);
    });

    test('should register a handler for wildcard pattern', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('user.*', handler);

      const handlers = service.getHandlers();
      expect(handlers).toHaveLength(1);
      expect(handlers[0].pattern).toBe('user.*');
    });

    test('should register multiple handlers for same pattern', () => {
      const handler1: EventHandler = () => {};
      const handler2: EventHandler = () => {};

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);

      const handlers = service.getHandlers();
      expect(handlers).toHaveLength(2);
    });

    test('should register handler with once=true', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('user.created', handler, true);

      const handlers = service.getHandlers();
      expect(handlers[0].once).toBe(true);
    });

    test('should invalidate warmup cache on registration', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('test', handler);

      // Trigger warmup
      service.dispatch('test');

      // Register new handler - should invalidate warmup
      service.registerHandler('test2', handler);

      // Dispatch should work (warmup re-triggered)
      const result = service.dispatch('test2');
      expect(result).toBe(true);
    });
  });

  describe('unregisterHandler', () => {
    test('should remove registered handler', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('user.created', handler);

      const removed = service.unregisterHandler('user.created', handler);

      expect(removed).toBe(true);
      expect(service.getHandlers()).toHaveLength(0);
    });

    test('should return false if handler not found', () => {
      const handler: EventHandler = () => {};
      const removed = service.unregisterHandler('user.created', handler);

      expect(removed).toBe(false);
    });

    test('should only remove matching pattern and handler', () => {
      const handler1: EventHandler = () => {};
      const handler2: EventHandler = () => {};

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);
      service.registerHandler('user.updated', handler1);

      service.unregisterHandler('user.created', handler1);

      const handlers = service.getHandlers();
      expect(handlers).toHaveLength(2);
      expect(handlers[0].pattern).toBe('user.created');
      expect(handlers[0].handler).toBe(handler2);
      expect(handlers[1].pattern).toBe('user.updated');
    });

    test('should invalidate warmup cache on unregistration', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('test', handler);

      // Trigger warmup
      service.dispatch('test');

      // Unregister - should invalidate warmup
      service.unregisterHandler('test', handler);

      // Dispatch should return false (no handlers)
      const result = service.dispatch('test');
      expect(result).toBe(false);
    });
  });

  describe('dispatch - exact match', () => {
    test('should dispatch to exact match handler', () => {
      let called = false;
      const handler: EventHandler = () => {
        called = true;
      };

      service.registerHandler('user.created', handler);
      const result = service.dispatch('user.created');

      expect(result).toBe(true);
      expect(called).toBe(true);
    });

    test('should pass event name and data to handler', () => {
      let receivedEvent = '';
      let receivedData: any = null;

      const handler: EventHandler = (eventName, data) => {
        receivedEvent = eventName;
        receivedData = data;
      };

      service.registerHandler('user.created', handler);
      service.dispatch('user.created', { id: 123, name: 'John' });

      expect(receivedEvent).toBe('user.created');
      expect(receivedData).toEqual({ id: 123, name: 'John' });
    });

    test('should return false if no handlers match', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('user.created', handler);

      const result = service.dispatch('user.updated');

      expect(result).toBe(false);
    });

    test('should call multiple handlers for same event', () => {
      let count = 0;
      const handler1: EventHandler = () => {
        count++;
      };
      const handler2: EventHandler = () => {
        count++;
      };

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);

      service.dispatch('user.created');

      expect(count).toBe(2);
    });
  });

  describe('dispatch - wildcard match', () => {
    test('should dispatch to wildcard pattern handlers', () => {
      let called = false;
      const handler: EventHandler = () => {
        called = true;
      };

      service.registerHandler('user.*', handler);
      service.dispatch('user.created');

      expect(called).toBe(true);
    });

    test('should dispatch to all wildcard (*) handler', () => {
      let called = false;
      const handler: EventHandler = () => {
        called = true;
      };

      service.registerHandler('*', handler);

      service.dispatch('user.created');
      expect(called).toBe(true);

      called = false;
      service.dispatch('download.complete');
      expect(called).toBe(true);
    });

    test('should dispatch to suffix wildcard (*.complete)', () => {
      let count = 0;
      const handler: EventHandler = () => {
        count++;
      };

      service.registerHandler('*.complete', handler);

      service.dispatch('download.complete');
      service.dispatch('upload.complete');
      service.dispatch('processing.complete');

      expect(count).toBe(3);
    });

    test('should dispatch to middle wildcard (user.*.created)', () => {
      let called = false;
      const handler: EventHandler = () => {
        called = true;
      };

      service.registerHandler('user.*.created', handler);
      service.dispatch('user.admin.created');

      expect(called).toBe(true);
    });
  });

  describe('dispatch - mixed exact and wildcard', () => {
    test('should call both exact and wildcard handlers', () => {
      let exactCalled = false;
      let wildcardCalled = false;

      const exactHandler: EventHandler = () => {
        exactCalled = true;
      };
      const wildcardHandler: EventHandler = () => {
        wildcardCalled = true;
      };

      service.registerHandler('user.created', exactHandler);
      service.registerHandler('user.*', wildcardHandler);

      service.dispatch('user.created');

      expect(exactCalled).toBe(true);
      expect(wildcardCalled).toBe(true);
    });

    test('should call all matching patterns', () => {
      let count = 0;
      const handler: EventHandler = () => {
        count++;
      };

      service.registerHandler('user.created', handler); // Exact match
      service.registerHandler('user.*', handler); // Prefix wildcard
      service.registerHandler('*.created', handler); // Suffix wildcard
      service.registerHandler('*', handler); // All wildcard

      service.dispatch('user.created');

      expect(count).toBe(4);
    });
  });

  describe('dispatch - once support', () => {
    test('should remove handler after first dispatch when once=true', () => {
      let count = 0;
      const handler: EventHandler = () => {
        count++;
      };

      service.registerHandler('user.created', handler, true);

      service.dispatch('user.created');
      service.dispatch('user.created');

      expect(count).toBe(1);
      expect(service.getHandlers()).toHaveLength(0);
    });

    test('should not remove handler when once=false', () => {
      let count = 0;
      const handler: EventHandler = () => {
        count++;
      };

      service.registerHandler('user.created', handler, false);

      service.dispatch('user.created');
      service.dispatch('user.created');

      expect(count).toBe(2);
      expect(service.getHandlers()).toHaveLength(1);
    });

    test('should remove only once handlers, keep regular ones', () => {
      let onceCount = 0;
      let regularCount = 0;

      const onceHandler: EventHandler = () => {
        onceCount++;
      };
      const regularHandler: EventHandler = () => {
        regularCount++;
      };

      service.registerHandler('user.created', onceHandler, true);
      service.registerHandler('user.created', regularHandler, false);

      service.dispatch('user.created');
      service.dispatch('user.created');

      expect(onceCount).toBe(1);
      expect(regularCount).toBe(2);
      expect(service.getHandlers()).toHaveLength(1);
    });
  });

  describe('dispatch - async handler support', () => {
    test('should handle async handlers without awaiting', async () => {
      let called = false;

      const asyncHandler: EventHandler = async () => {
        await Bun.sleep(10);
        called = true;
      };

      service.registerHandler('user.created', asyncHandler);
      const result = service.dispatch('user.created');

      // Should return immediately (fire-and-forget)
      expect(result).toBe(true);
      expect(called).toBe(false); // Not yet called

      // Wait for async handler to complete
      await Bun.sleep(20);
      expect(called).toBe(true);
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

      service.registerHandler('user.created', syncHandler);
      service.registerHandler('user.created', asyncHandler);

      service.dispatch('user.created');

      expect(syncCalled).toBe(true); // Sync called immediately
      expect(asyncCalled).toBe(false); // Async not yet

      await Bun.sleep(20);
      expect(asyncCalled).toBe(true);
    });

    test('should handle Promise-returning sync handlers', async () => {
      let called = false;

      const promiseHandler: EventHandler = () => {
        return Promise.resolve().then(() => {
          called = true;
        });
      };

      service.registerHandler('user.created', promiseHandler);
      service.dispatch('user.created');

      expect(called).toBe(false); // Not yet
      await Bun.sleep(10);
      expect(called).toBe(true);
    });
  });

  describe('dispatch - error handling', () => {
    test('should isolate sync handler errors', () => {
      let handler2Called = false;

      const errorHandler: EventHandler = () => {
        throw new Error('Handler error');
      };

      const normalHandler: EventHandler = () => {
        handler2Called = true;
      };

      service.registerHandler('user.created', errorHandler);
      service.registerHandler('user.created', normalHandler);

      // Should not throw, should continue with other handlers
      const result = service.dispatch('user.created');

      expect(result).toBe(true);
      expect(handler2Called).toBe(true);
    });

    test('should handle async handler errors', async () => {
      let handler2Called = false;

      const asyncErrorHandler: EventHandler = async () => {
        await Bun.sleep(5);
        throw new Error('Async error');
      };

      const normalHandler: EventHandler = () => {
        handler2Called = true;
      };

      service.registerHandler('user.created', asyncErrorHandler);
      service.registerHandler('user.created', normalHandler);

      service.dispatch('user.created');

      expect(handler2Called).toBe(true);

      // Wait for async error to be caught (should not throw)
      await Bun.sleep(20);
    });

    test('should handle Promise rejection', async () => {
      const rejectedHandler: EventHandler = () => {
        return Promise.reject(new Error('Promise rejected'));
      };

      service.registerHandler('user.created', rejectedHandler);

      // Should not throw
      service.dispatch('user.created');

      // Wait for rejection to be caught
      await Bun.sleep(10);
    });
  });

  describe('warmup behavior', () => {
    test('should warmup on first dispatch', () => {
      const handler: EventHandler = () => {};

      service.registerHandler('user.created', handler);
      service.registerHandler('user.*', handler);

      // First dispatch triggers warmup
      service.dispatch('user.created');

      // Warmup should have separated exact and wildcard patterns
      // (This is internal behavior, we verify by checking dispatch works)
      const result = service.dispatch('user.updated');
      expect(result).toBe(true); // Wildcard should match
    });

    test('should not warmup until first dispatch', () => {
      const handler: EventHandler = () => {};

      service.registerHandler('user.created', handler);

      // No dispatch yet - warmup not triggered
      // (Internal state, verified by successful dispatch later)
      const result = service.dispatch('user.created');
      expect(result).toBe(true);
    });

    test('should re-warmup after handler registration', () => {
      const handler: EventHandler = () => {};

      service.registerHandler('user.created', handler);
      service.dispatch('user.created'); // Warmup

      // Add new handler - invalidates warmup
      service.registerHandler('user.updated', handler);

      // Should re-warmup and work correctly
      const result = service.dispatch('user.updated');
      expect(result).toBe(true);
    });
  });

  describe('getHandlers', () => {
    test('should return copy of handlers array', () => {
      const handler: EventHandler = () => {};
      service.registerHandler('user.created', handler);

      const handlers = service.getHandlers();

      // Should be a copy (not reference)
      handlers.push({ pattern: 'fake', handler, once: false });

      expect(service.getHandlers()).toHaveLength(1);
    });

    test('should return empty array when no handlers', () => {
      const handlers = service.getHandlers();
      expect(handlers).toEqual([]);
    });
  });

  describe('clearHandlers', () => {
    test('should remove all handlers', () => {
      const handler: EventHandler = () => {};

      service.registerHandler('user.created', handler);
      service.registerHandler('user.updated', handler);
      service.registerHandler('user.*', handler);

      service.clearHandlers();

      expect(service.getHandlers()).toHaveLength(0);
    });

    test('should reset warmup state', () => {
      const handler: EventHandler = () => {};

      service.registerHandler('user.created', handler);
      service.dispatch('user.created'); // Warmup

      service.clearHandlers();

      // Should work after clear and re-registration
      service.registerHandler('user.updated', handler);
      const result = service.dispatch('user.updated');
      expect(result).toBe(true);
    });
  });
});
