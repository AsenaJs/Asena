import { describe, expect, test } from 'bun:test';
import { On } from '../../../../lib/server/event';
import { ComponentConstants } from '../../../../lib/ioc';
import { getTypedMetadata } from '../../../../lib/utils';
import type { EventHandlerMetadata } from '../../../../lib/server/event';

describe('@On Decorator', () => {
  describe('Metadata Storage', () => {
    test('should store event pattern metadata', () => {
      class TestService {
        @On('user.created')
        handleUserCreated() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers).toBeDefined();
      expect(handlers!['handleUserCreated']).toBeDefined();
      expect(handlers!['handleUserCreated'].pattern).toBe('user.created');
      expect(handlers!['handleUserCreated'].methodName).toBe('handleUserCreated');
      expect(handlers!['handleUserCreated'].skip).toBe(false);
    });

    test('should support object params with skip flag', () => {
      class TestService {
        @On({ event: 'user.deleted', skip: true })
        handleDeleted() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleDeleted'].pattern).toBe('user.deleted');
      expect(handlers!['handleDeleted'].skip).toBe(true);
    });

    test('should default skip to false when not specified', () => {
      class TestService {
        @On({ event: 'test.event' })
        handleEvent() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleEvent'].skip).toBe(false);
    });
  });

  describe('Multiple Handlers', () => {
    test('should store multiple handlers on same class', () => {
      class TestService {
        @On('user.created')
        handleCreated() {}

        @On('user.updated')
        handleUpdated() {}

        @On('user.deleted')
        handleDeleted() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(Object.keys(handlers!)).toHaveLength(3);
      expect(handlers!['handleCreated']).toBeDefined();
      expect(handlers!['handleUpdated']).toBeDefined();
      expect(handlers!['handleDeleted']).toBeDefined();
    });

    test('should preserve all handler metadata correctly', () => {
      class TestService {
        @On('event.one')
        handleOne() {}

        @On({ event: 'event.two', skip: true })
        handleTwo() {}

        @On('event.three')
        handleThree() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleOne'].pattern).toBe('event.one');
      expect(handlers!['handleOne'].skip).toBe(false);

      expect(handlers!['handleTwo'].pattern).toBe('event.two');
      expect(handlers!['handleTwo'].skip).toBe(true);

      expect(handlers!['handleThree'].pattern).toBe('event.three');
      expect(handlers!['handleThree'].skip).toBe(false);
    });
  });

  describe('Wildcard Patterns', () => {
    test('should support wildcard patterns', () => {
      class TestService {
        @On('user.*')
        handleAll() {}

        @On('*.error')
        handleErrors() {}

        @On('*')
        handleEverything() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleAll'].pattern).toBe('user.*');
      expect(handlers!['handleErrors'].pattern).toBe('*.error');
      expect(handlers!['handleEverything'].pattern).toBe('*');
    });

    test('should support complex wildcard patterns', () => {
      class TestService {
        @On('user.*.created')
        handleUserCreated() {}

        @On('*.*.error')
        handleNestedErrors() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleUserCreated'].pattern).toBe('user.*.created');
      expect(handlers!['handleNestedErrors'].pattern).toBe('*.*.error');
    });
  });

  describe('Method Name Handling', () => {
    test('should store method name correctly', () => {
      class TestService {
        @On('test.event')
        myCustomHandlerName() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['myCustomHandlerName'].methodName).toBe('myCustomHandlerName');
    });

    test('should handle different method names', () => {
      class TestService {
        @On('event.a')
        methodA() {}

        @On('event.b')
        method_b_with_underscore() {}

        @On('event.c')
        methodCWithCamelCase() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['methodA'].methodName).toBe('methodA');
      expect(handlers!['method_b_with_underscore'].methodName).toBe('method_b_with_underscore');
      expect(handlers!['methodCWithCamelCase'].methodName).toBe('methodCWithCamelCase');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty event pattern', () => {
      class TestService {
        @On('')
        handleEmpty() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleEmpty'].pattern).toBe('');
    });

    test('should handle event pattern with dots', () => {
      class TestService {
        @On('very.long.event.name.with.many.dots')
        handleLongEvent() {}
      }

      const handlers = getTypedMetadata<Record<string, EventHandlerMetadata>>(
        ComponentConstants.EventHandlersKey,
        TestService,
      );

      expect(handlers!['handleLongEvent'].pattern).toBe('very.long.event.name.with.many.dots');
    });
  });
});
