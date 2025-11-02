import { describe, expect, test, beforeEach } from 'bun:test';
import { PrepareEventService } from '../../../lib/server/src/services/PrepareEventService';
import { Container } from '../../../lib/ioc';
import { EventEmitter } from '../../../lib/server/event';
import { EventDispatchService } from '../../../lib/server/event';
import { EventService } from '../../../lib/server/decorators';
import { On } from '../../../lib/server/event';

describe('PrepareEventService', () => {
  let prepareService: PrepareEventService;
  let container: Container;
  let emitter: EventEmitter;
  let dispatcher: EventDispatchService;

  beforeEach(async () => {
    container = new Container();
    dispatcher = new EventDispatchService();
    emitter = new EventEmitter();
    (emitter as any).dispatcher = dispatcher;

    prepareService = new PrepareEventService();
    (prepareService as any).container = container;
    (prepareService as any).dispatchService = dispatcher;
  });

  describe('Pattern Building', () => {
    test('should build pattern with prefix and event', async () => {
      let called = false;

      @EventService({ prefix: 'user' })
      class UserEventService {
        @On('created')
        handleCreated() {
          called = true;
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      await prepareService.prepare();

      // Verify pattern is 'user.created'
      const result = emitter.emit('user.created');
      expect(result).toBe(true);
      expect(called).toBe(true);
    });

    test('should use event pattern when no prefix', async () => {
      let called = false;

      @EventService()
      class GlobalEventService {
        @On('app.started')
        handleStarted() {
          called = true;
        }
      }

      const service = new GlobalEventService();
      await container.registerInstance('GlobalEventService', service);

      await prepareService.prepare();

      const result = emitter.emit('app.started');
      expect(result).toBe(true);
      expect(called).toBe(true);
    });

    test('should support wildcard patterns with prefix', async () => {
      let callCount = 0;

      @EventService({ prefix: 'download' })
      class DownloadEventService {
        @On('*')
        handleAll() {
          callCount++;
        }
      }

      const service = new DownloadEventService();
      await container.registerInstance('DownloadEventService', service);

      await prepareService.prepare();

      // Should handle 'download.*'
      emitter.emit('download.complete');
      emitter.emit('download.start');
      emitter.emit('download.progress');

      expect(callCount).toBe(3);
    });

    test('should handle prefix without event', async () => {
      let called = false;

      @EventService({ prefix: 'test' })
      class TestEventService {
        @On('')
        handleEmpty() {
          called = true;
        }
      }

      const service = new TestEventService();
      await container.registerInstance('TestEventService', service);

      await prepareService.prepare();

      // Pattern should be just 'test'
      const result = emitter.emit('test');
      expect(result).toBe(true);
      expect(called).toBe(true);
    });
  });

  describe('Handler Registration', () => {
    test('should register multiple handlers from same service', async () => {
      let createdCalled = false;
      let updatedCalled = false;

      @EventService({ prefix: 'user' })
      class UserEventService {
        @On('created')
        handleCreated() {
          createdCalled = true;
        }

        @On('updated')
        handleUpdated() {
          updatedCalled = true;
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      await prepareService.prepare();

      emitter.emit('user.created');
      emitter.emit('user.updated');

      expect(createdCalled).toBe(true);
      expect(updatedCalled).toBe(true);
    });

    test('should skip handlers with skip=true', async () => {
      let called = false;

      @EventService({ prefix: 'user' })
      class UserEventService {
        @On({ event: 'deleted', skip: true })
        handleDeleted() {
          called = true;
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      await prepareService.prepare();

      const result = emitter.emit('user.deleted');
      expect(result).toBe(false); // No handler registered
      expect(called).toBe(false);
    });

    test('should register handlers from multiple services', async () => {
      let userCalled = false;
      let orderCalled = false;

      @EventService({ prefix: 'user' })
      class UserEventService {
        @On('created')
        handle() {
          userCalled = true;
        }
      }

      @EventService({ prefix: 'order' })
      class OrderEventService {
        @On('created')
        handle() {
          orderCalled = true;
        }
      }

      const userService = new UserEventService();
      const orderService = new OrderEventService();

      await container.registerInstance('UserEventService', userService);
      await container.registerInstance('OrderEventService', orderService);

      await prepareService.prepare();

      emitter.emit('user.created');
      emitter.emit('order.created');

      expect(userCalled).toBe(true);
      expect(orderCalled).toBe(true);
    });
  });

  describe('Method Binding', () => {
    test('should bind method to service instance correctly', async () => {
      let receivedValue: string | undefined;

      @EventService({ prefix: 'test' })
      class TestService {
        public value = 'original';

        @On('event')
        handleEvent() {
          receivedValue = this.value; // Should access instance property
        }
      }

      const service = new TestService();
      await container.registerInstance('TestService', service);

      await prepareService.prepare();

      // Handler should have access to 'this'
      emitter.emit('test.event');
      expect(receivedValue).toBe('original');
    });

    test('should maintain correct context across multiple handlers', async () => {
      const values: string[] = [];

      @EventService({ prefix: 'test' })
      class TestService {
        private id = 'service-123';

        @On('event1')
        handler1() {
          values.push(this.id);
        }

        @On('event2')
        handler2() {
          values.push(this.id);
        }
      }

      const service = new TestService();
      await container.registerInstance('TestService', service);

      await prepareService.prepare();

      emitter.emit('test.event1');
      emitter.emit('test.event2');

      expect(values).toEqual(['service-123', 'service-123']);
    });
  });

  describe('Edge Cases', () => {
    test('should handle no event services gracefully', async () => {
      await prepareService.prepare();
      // Should not throw
    });

    test('should handle service with no @On methods', async () => {
      @EventService({ prefix: 'empty' })
      class EmptyService {
        // No @On methods
      }

      const service = new EmptyService();
      await container.registerInstance('EmptyService', service);

      await prepareService.prepare();
      // Should not throw
    });

    test('should handle undefined prefix metadata', async () => {
      let called = false;

      @EventService()
      class TestService {
        @On('test.event')
        handleEvent() {
          called = true;
        }
      }

      const service = new TestService();
      await container.registerInstance('TestService', service);

      await prepareService.prepare();

      emitter.emit('test.event');
      expect(called).toBe(true);
    });

    test('should handle event data being passed to handlers', async () => {
      let receivedData: any;

      @EventService({ prefix: 'user' })
      class UserEventService {
        @On('created')
        handleCreated(_eventName: string, data: any) {
          receivedData = data;
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      await prepareService.prepare();

      const testData = { id: 123, name: 'John' };
      emitter.emit('user.created', testData);

      expect(receivedData).toEqual(testData);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle multiple services listening to same event', async () => {
      let count = 0;

      @EventService({ prefix: 'user' })
      class UserEventService1 {
        @On('created')
        handle() {
          count++;
        }
      }

      @EventService({ prefix: 'user' })
      class UserEventService2 {
        @On('created')
        handle() {
          count++;
        }
      }

      @EventService()
      class GlobalEventService {
        @On('user.created')
        handle() {
          count++;
        }
      }

      const service1 = new UserEventService1();
      const service2 = new UserEventService2();
      const service3 = new GlobalEventService();

      await container.registerInstance('UserEventService1', service1);
      await container.registerInstance('UserEventService2', service2);
      await container.registerInstance('GlobalEventService', service3);

      await prepareService.prepare();

      emitter.emit('user.created');

      expect(count).toBe(3);
    });

    test('should handle mixed skip and active handlers', async () => {
      let activeCount = 0;

      @EventService({ prefix: 'test' })
      class TestService {
        @On('event1')
        handler1() {
          activeCount++;
        }

        @On({ event: 'event2', skip: true })
        handler2() {
          activeCount++;
        }

        @On('event3')
        handler3() {
          activeCount++;
        }
      }

      const service = new TestService();
      await container.registerInstance('TestService', service);

      await prepareService.prepare();

      emitter.emit('test.event1');
      emitter.emit('test.event2'); // Skipped
      emitter.emit('test.event3');

      expect(activeCount).toBe(2);
    });
  });
});
