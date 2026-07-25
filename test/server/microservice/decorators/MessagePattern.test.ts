import { describe, expect, test } from 'bun:test';
import { MessagePattern } from '../../../../lib/server/microservice';
import { ComponentConstants } from '../../../../lib/ioc';
import { getTypedMetadata } from '../../../../lib/utils';
import type { MessageHandlerMetadata } from '../../../../lib/server/microservice';

describe('@MessagePattern Decorator', () => {
  describe('Metadata Storage', () => {
    test('should store message pattern metadata with message type', () => {
      class TestHandler {
        @MessagePattern('order.create')
        create() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers).toBeDefined();
      expect(handlers!['create'].pattern).toBe('order.create');
      expect(handlers!['create'].type).toBe('message');
      expect(handlers!['create'].methodName).toBe('create');
      expect(handlers!['create'].skip).toBe(false);
      expect(handlers!['create'].prefix).toBe(true);
    });

    test('should store the prefix: false opt-out', () => {
      class TestHandler {
        @MessagePattern({ pattern: 'ping', prefix: false })
        ping() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['ping'].prefix).toBe(false);
    });

    test('should support object params with skip flag', () => {
      class TestHandler {
        @MessagePattern({ pattern: 'order.delete', skip: true })
        remove() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['remove'].pattern).toBe('order.delete');
      expect(handlers!['remove'].skip).toBe(true);
    });

    test('should store multiple handlers on same class', () => {
      class TestHandler {
        @MessagePattern('order.create')
        create() {}

        @MessagePattern('order.update')
        update() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(Object.keys(handlers!)).toHaveLength(2);
      expect(handlers!['create'].pattern).toBe('order.create');
      expect(handlers!['update'].pattern).toBe('order.update');
    });
  });

  describe('Wildcard Rejection', () => {
    test('should throw at decoration time for wildcard patterns', () => {
      expect(() => {
        class TestHandler {
          @MessagePattern('order.*')
          handleAll() {}
        }

        return TestHandler;
      }).toThrow(/cannot contain wildcards/);
    });

    test('should throw for universal wildcard', () => {
      expect(() => {
        class TestHandler {
          @MessagePattern('*')
          handleEverything() {}
        }

        return TestHandler;
      }).toThrow(/cannot contain wildcards/);
    });

    test('should still reject wildcards when opting out of the prefix', () => {
      // prefix: false must not relax the exact-routing rule
      expect(() => {
        class TestHandler {
          @MessagePattern({ pattern: '*', prefix: false })
          handleEverything() {}
        }

        return TestHandler;
      }).toThrow(/cannot contain wildcards/);
    });

    test('should throw for wildcard in object params', () => {
      expect(() => {
        class TestHandler {
          @MessagePattern({ pattern: '*.create' })
          handleCreate() {}
        }

        return TestHandler;
      }).toThrow(/cannot contain wildcards/);
    });
  });
});
