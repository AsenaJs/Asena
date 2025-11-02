import { describe, it, expect, beforeEach } from 'bun:test';
import { Container } from '../../../lib/ioc';
import { EventEmitter } from '../../../lib/server/event';
import { EventDispatchService } from '../../../lib/server/event';
import { PrepareEventService } from '../../../lib/server/src/services/PrepareEventService';
import { EventService } from '../../../lib/server/decorators';
import { On } from '../../../lib/server/event';
import { Inject } from '../../../lib/ioc/component';
import { ICoreServiceNames } from '../../../lib/ioc';
import { Service } from '../../../lib/server/decorators';

/**
 * Integration Tests for Event System
 *
 * These tests verify the complete event system flow:
 * 1. EventService classes with @On handlers
 * 2. PrepareEventService scans and registers handlers
 * 3. EventEmitter.emit() triggers handlers
 * 4. Pattern matching works correctly
 * 5. DI integration with @Inject
 * 6. Error isolation and async handling
 */
describe('Event System Integration', () => {
  let container: Container;
  let emitter: EventEmitter;
  let dispatcher: EventDispatchService;
  let prepareService: PrepareEventService;

  beforeEach(async () => {
    // Setup: Create fresh container with event system services
    container = new Container();

    // Register core event services
    dispatcher = new EventDispatchService();
    emitter = new EventEmitter();
    prepareService = new PrepareEventService();

    // Register instances in container
    await container.registerInstance(ICoreServiceNames.CONTAINER, container);
    await container.registerInstance(ICoreServiceNames.EVENT_DISPATCH_SERVICE, dispatcher);
    await container.registerInstance(ICoreServiceNames.EVENT_EMITTER, emitter);
    await container.registerInstance(ICoreServiceNames.PREPARE_EVENT_SERVICE, prepareService);

    // Manual DI - inject dependencies
    (emitter as any).dispatcher = dispatcher;
    (prepareService as any).container = container;
    (prepareService as any).dispatchService = dispatcher;
  });

  describe('Basic Flow: Decorator → Registration → Emit → Handler', () => {
    it('should register and call a simple event handler', async () => {
      // Arrange: Create event service with handler
      const calls: any[] = [];

      @EventService()
      class UserEventService {
        @On('user.created')
        handleUserCreated(eventName: string, data: any) {
          calls.push({ eventName, data });
        }
      }

      // Register service in container
      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      // Act: Prepare and emit
      await prepareService.prepare();
      const success = emitter.emit('user.created', { id: 123, name: 'John' });

      // Assert
      expect(success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].eventName).toBe('user.created');
      expect(calls[0].data).toEqual({ id: 123, name: 'John' });
    });

    it('should handle event service with prefix', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService({ prefix: 'user' })
      class UserEventService {
        @On('created')
        handleCreated(eventName: string, data: any) {
          calls.push({ eventName, data });
        }

        @On('updated')
        handleUpdated(eventName: string, data: any) {
          calls.push({ eventName, data });
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('user.created', { id: 1 });
      emitter.emit('user.updated', { id: 1 });

      // Assert
      expect(calls).toHaveLength(2);
      expect(calls[0].eventName).toBe('user.created');
      expect(calls[1].eventName).toBe('user.updated');
    });

    it('should handle prefix as string shorthand', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService('user')
      class UserEventService {
        @On('deleted')
        handleDeleted(eventName: string, data: any) {
          calls.push({ eventName, data });
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('user.deleted', { id: 1 });

      // Assert
      expect(calls).toHaveLength(1);
      expect(calls[0].eventName).toBe('user.deleted');
    });
  });

  describe('Wildcard Pattern Matching', () => {
    it('should match wildcard patterns correctly', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService()
      class WildcardEventService {
        @On('user.*')
        handleAllUserEvents(eventName: string, data: any) {
          calls.push({ pattern: 'user.*', eventName, data });
        }

        @On('*.error')
        handleAllErrors(eventName: string, data: any) {
          calls.push({ pattern: '*.error', eventName, data });
        }
      }

      const service = new WildcardEventService();
      await container.registerInstance('WildcardEventService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('user.created', { id: 1 });
      emitter.emit('user.updated', { id: 2 });
      emitter.emit('auth.error', { code: 401 });
      emitter.emit('db.error', { code: 500 });

      // Assert
      expect(calls).toHaveLength(4);
      expect(calls[0]).toEqual({ pattern: 'user.*', eventName: 'user.created', data: { id: 1 } });
      expect(calls[1]).toEqual({ pattern: 'user.*', eventName: 'user.updated', data: { id: 2 } });
      expect(calls[2]).toEqual({ pattern: '*.error', eventName: 'auth.error', data: { code: 401 } });
      expect(calls[3]).toEqual({ pattern: '*.error', eventName: 'db.error', data: { code: 500 } });
    });

    it('should combine prefix with wildcard patterns', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService('user')
      class UserEventService {
        @On('*.success')
        handleUserSuccess(eventName: string, data: any) {
          calls.push({ eventName, data });
        }
      }

      const service = new UserEventService();
      await container.registerInstance('UserEventService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('user.create.success', { id: 1 });
      emitter.emit('user.update.success', { id: 2 });

      // Assert
      expect(calls).toHaveLength(2);
      expect(calls[0].eventName).toBe('user.create.success');
      expect(calls[1].eventName).toBe('user.update.success');
    });
  });

  describe('Multiple Services and Handlers', () => {
    it('should handle multiple services listening to same event', async () => {
      // Arrange
      const calls: string[] = [];

      @EventService()
      class EmailService {
        @On('user.created')
        sendWelcomeEmail(_eventName: string, _data: any) {
          calls.push('email-sent');
        }
      }

      @EventService()
      class AnalyticsService {
        @On('user.created')
        trackUserCreation(_eventName: string, _data: any) {
          calls.push('analytics-tracked');
        }
      }

      @EventService()
      class NotificationService {
        @On('user.created')
        sendNotification(_eventName: string, _data: any) {
          calls.push('notification-sent');
        }
      }

      const email = new EmailService();
      const analytics = new AnalyticsService();
      const notification = new NotificationService();

      await container.registerInstance('EmailService', email);
      await container.registerInstance('AnalyticsService', analytics);
      await container.registerInstance('NotificationService', notification);

      // Act
      await prepareService.prepare();
      emitter.emit('user.created', { id: 123 });

      // Assert - all three handlers should be called
      expect(calls).toHaveLength(3);
      expect(calls).toContain('email-sent');
      expect(calls).toContain('analytics-tracked');
      expect(calls).toContain('notification-sent');
    });

    it('should handle single service with multiple handlers for different events', async () => {
      // Arrange
      const calls: string[] = [];

      @EventService()
      class AuditService {
        @On('user.created')
        logCreation() {
          calls.push('user-created');
        }

        @On('user.updated')
        logUpdate() {
          calls.push('user-updated');
        }

        @On('user.deleted')
        logDeletion() {
          calls.push('user-deleted');
        }

        @On('*.error')
        logError() {
          calls.push('error-logged');
        }
      }

      const audit = new AuditService();
      await container.registerInstance('AuditService', audit);

      // Act
      await prepareService.prepare();
      emitter.emit('user.created', {});
      emitter.emit('user.updated', {});
      emitter.emit('user.deleted', {});
      emitter.emit('db.error', {});

      // Assert
      expect(calls).toEqual(['user-created', 'user-updated', 'user-deleted', 'error-logged']);
    });
  });

  describe('Dependency Injection Integration', () => {
    it('should inject EventEmitter into regular services', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService()
      class UserEventService {
        @On('user.created')
        handleUserCreated(eventName: string, data: any) {
          calls.push({ eventName, data });
        }
      }

      @Service()
      class UserService {
        @Inject(ICoreServiceNames.EVENT_EMITTER)
        private emitter!: EventEmitter;

        createUser(name: string) {
          const user = { id: Math.random(), name };
          // Emit event from within service
          this.emitter.emit('user.created', user);
          return user;
        }
      }

      const eventService = new UserEventService();
      const userService = new UserService();

      await container.registerInstance('UserEventService', eventService);
      await container.registerInstance('UserService', userService);

      // Inject emitter into UserService
      (userService as any).emitter = emitter;

      // Act
      await prepareService.prepare();
      userService.createUser('John');

      // Assert
      expect(calls).toHaveLength(1);
      expect(calls[0].data.name).toBe('John');
    });

    it('should allow event services to access injected dependencies', async () => {
      // Arrange
      const dbCalls: any[] = [];
      const eventCalls: any[] = [];

      @Service()
      class DatabaseService {
        save(data: any) {
          dbCalls.push(data);
          return { ...data, saved: true };
        }
      }

      @EventService()
      class UserEventService {
        @Inject('DatabaseService')
        private db!: DatabaseService;

        @On('user.created')
        saveUserToDb(eventName: string, data: any) {
          eventCalls.push({ eventName, data });
          this.db.save(data);
        }
      }

      const db = new DatabaseService();
      const eventService = new UserEventService();

      await container.registerInstance('DatabaseService', db);
      await container.registerInstance('UserEventService', eventService);

      // Inject DB into event service
      (eventService as any).db = db;

      // Act
      await prepareService.prepare();
      emitter.emit('user.created', { id: 123, name: 'John' });

      // Assert
      expect(eventCalls).toHaveLength(1);
      expect(dbCalls).toHaveLength(1);
      expect(dbCalls[0]).toEqual({ id: 123, name: 'John' });
    });
  });

  describe('Error Handling and Isolation', () => {
    it('should isolate sync handler errors (one error should not affect others)', async () => {
      // Arrange
      const calls: string[] = [];

      @EventService()
      class ErrorTestService {
        @On('test.event')
        handler1() {
          calls.push('handler1');
        }

        @On('test.event')
        handler2() {
          calls.push('handler2');
          throw new Error('Handler 2 failed');
        }

        @On('test.event')
        handler3() {
          calls.push('handler3');
        }
      }

      const service = new ErrorTestService();
      await container.registerInstance('ErrorTestService', service);

      // Act
      await prepareService.prepare();
      const success = emitter.emit('test.event', {});

      // Assert - all handlers should be called despite error in handler2
      expect(success).toBe(true);
      expect(calls).toEqual(['handler1', 'handler2', 'handler3']);
    });

    it('should isolate async handler errors', async () => {
      // Arrange
      const calls: string[] = [];

      @EventService()
      class AsyncErrorTestService {
        @On('test.async')
        async handler1() {
          calls.push('async1');
        }

        @On('test.async')
        async handler2() {
          calls.push('async2');
          throw new Error('Async handler failed');
        }

        @On('test.async')
        async handler3() {
          calls.push('async3');
        }
      }

      const service = new AsyncErrorTestService();
      await container.registerInstance('AsyncErrorTestService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('test.async', {});

      // Wait for async handlers
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert
      expect(calls).toEqual(['async1', 'async2', 'async3']);
    });
  });

  describe('Event Chaining (Handler Emits Another Event)', () => {
    it('should support event chaining', async () => {
      // Arrange
      const calls: string[] = [];

      @EventService()
      class ChainEventService {
        @Inject(ICoreServiceNames.EVENT_EMITTER)
        private emitter!: EventEmitter;

        @On('user.created')
        handleUserCreated(_eventName: string, data: any) {
          calls.push('user-created');
          // Chain: emit another event
          this.emitter.emit('email.send', { to: data.email });
        }

        @On('email.send')
        handleEmailSend(_eventName: string, _data: any) {
          calls.push('email-sent');
        }
      }

      const service = new ChainEventService();
      await container.registerInstance('ChainEventService', service);

      // Inject emitter
      (service as any).emitter = emitter;

      // Act
      await prepareService.prepare();
      emitter.emit('user.created', { email: 'john@example.com' });

      // Assert - both events should be handled
      expect(calls).toEqual(['user-created', 'email-sent']);
    });

    it('should support complex event chains', async () => {
      // Arrange
      const sequence: string[] = [];

      @EventService()
      class ComplexChainService {
        @Inject(ICoreServiceNames.EVENT_EMITTER)
        private emitter!: EventEmitter;

        @On('order.placed')
        handleOrderPlaced() {
          sequence.push('1-order-placed');
          this.emitter.emit('payment.process', {});
        }

        @On('payment.process')
        handlePayment() {
          sequence.push('2-payment-processed');
          this.emitter.emit('inventory.reserve', {});
        }

        @On('inventory.reserve')
        handleInventory() {
          sequence.push('3-inventory-reserved');
          this.emitter.emit('notification.send', {});
        }

        @On('notification.send')
        handleNotification() {
          sequence.push('4-notification-sent');
        }
      }

      const service = new ComplexChainService();
      await container.registerInstance('ComplexChainService', service);
      (service as any).emitter = emitter;

      // Act
      await prepareService.prepare();
      emitter.emit('order.placed', {});

      // Assert - all 4 events should be handled in order
      expect(sequence).toEqual([
        '1-order-placed',
        '2-payment-processed',
        '3-inventory-reserved',
        '4-notification-sent',
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should return false when no handlers match', async () => {
      // Arrange
      @EventService()
      class EmptyService {
        @On('user.created')
        handle() {}
      }

      const service = new EmptyService();
      await container.registerInstance('EmptyService', service);

      await prepareService.prepare();

      // Act - emit event with no handlers
      const success = emitter.emit('unknown.event', {});

      // Assert
      expect(success).toBe(false);
    });

    it('should skip handlers marked with skip: true', async () => {
      // Arrange
      const calls: string[] = [];

      @EventService()
      class SkipTestService {
        @On('test.event')
        activeHandler() {
          calls.push('active');
        }

        @On({ event: 'test.event', skip: true })
        skippedHandler() {
          calls.push('skipped');
        }
      }

      const service = new SkipTestService();
      await container.registerInstance('SkipTestService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('test.event', {});

      // Assert - only active handler should be called
      expect(calls).toEqual(['active']);
    });

    it('should handle event service with no @On methods', async () => {
      // Arrange
      @EventService()
      class EmptyEventService {
        // No @On methods
        someMethod() {}
      }

      const service = new EmptyEventService();
      await container.registerInstance('EmptyEventService', service);

      // Act - should not throw
      await prepareService.prepare();

      // Assert - no errors
      expect(true).toBe(true);
    });

    it('should handle empty prefix with event pattern', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService({ prefix: '' })
      class NoPrefixService {
        @On('direct.event')
        handle(eventName: string) {
          calls.push(eventName);
        }
      }

      const service = new NoPrefixService();
      await container.registerInstance('NoPrefixService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('direct.event', {});

      // Assert
      expect(calls).toEqual(['direct.event']);
    });

    it('should handle prefix with empty event pattern', async () => {
      // Arrange
      const calls: any[] = [];

      @EventService('user')
      class PrefixOnlyService {
        @On('')
        handle(eventName: string) {
          calls.push(eventName);
        }
      }

      const service = new PrefixOnlyService();
      await container.registerInstance('PrefixOnlyService', service);

      // Act
      await prepareService.prepare();
      emitter.emit('user', {});

      // Assert
      expect(calls).toEqual(['user']);
    });

    it('should handle no event services registered', async () => {
      // Act - prepare with no event services
      await prepareService.prepare();

      // Assert - should not throw
      const success = emitter.emit('any.event', {});
      expect(success).toBe(false);
    });
  });

  describe('Fire-and-Forget Pattern', () => {
    it('should not wait for async handlers (fire-and-forget)', async () => {
      // Arrange
      const calls: string[] = [];
      let asyncCompleted = false;

      @EventService()
      class AsyncService {
        @On('test.async')
        async slowHandler() {
          await new Promise((resolve) => setTimeout(resolve, 100));
          asyncCompleted = true;
          calls.push('async-done');
        }
      }

      const service = new AsyncService();
      await container.registerInstance('AsyncService', service);

      await prepareService.prepare();

      // Act
      const start = Date.now();
      emitter.emit('test.async', {});
      const duration = Date.now() - start;

      // Assert - emit should return immediately (< 50ms)
      expect(duration).toBeLessThan(50);
      expect(asyncCompleted).toBe(false);

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(asyncCompleted).toBe(true);
      expect(calls).toEqual(['async-done']);
    });
  });
});
