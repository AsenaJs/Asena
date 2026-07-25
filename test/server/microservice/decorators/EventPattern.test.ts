import { describe, expect, test } from 'bun:test';
import { EventPattern, MessagePattern } from '../../../../lib/server/microservice';
import { ComponentConstants } from '../../../../lib/ioc';
import { getTypedMetadata } from '../../../../lib/utils';
import type { MessageHandlerMetadata } from '../../../../lib/server/microservice';

describe('@EventPattern Decorator', () => {
  describe('Metadata Storage', () => {
    test('should store event pattern metadata with event type', () => {
      class TestHandler {
        @EventPattern('payment.completed')
        onPaymentCompleted() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers).toBeDefined();
      expect(handlers!['onPaymentCompleted'].pattern).toBe('payment.completed');
      expect(handlers!['onPaymentCompleted'].type).toBe('event');
      expect(handlers!['onPaymentCompleted'].skip).toBe(false);
      expect(handlers!['onPaymentCompleted'].prefix).toBe(true);
    });

    test('should support object params with skip flag', () => {
      class TestHandler {
        @EventPattern({ pattern: 'stock.depleted', skip: true })
        onStockDepleted() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['onStockDepleted'].skip).toBe(true);
    });

    test('should default prefix to true for object params without the flag', () => {
      class TestHandler {
        @EventPattern({ pattern: 'stock.depleted' })
        onStockDepleted() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['onStockDepleted'].prefix).toBe(true);
    });

    test('should store the prefix: false opt-out', () => {
      class TestHandler {
        @EventPattern({ pattern: 'payment.completed', prefix: false })
        onPaymentCompleted() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['onPaymentCompleted'].prefix).toBe(false);
      expect(handlers!['onPaymentCompleted'].skip).toBe(false);
    });

    test('should keep prefix and skip independent', () => {
      class TestHandler {
        @EventPattern({ pattern: 'payment.completed', prefix: false, skip: true })
        onPaymentCompleted() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['onPaymentCompleted'].prefix).toBe(false);
      expect(handlers!['onPaymentCompleted'].skip).toBe(true);
    });
  });

  describe('Wildcard Patterns', () => {
    test('should allow wildcard patterns', () => {
      class TestHandler {
        @EventPattern('payment.*')
        onAnyPayment() {}

        @EventPattern('*.completed')
        onAnyCompleted() {}

        @EventPattern('*')
        onEverything() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(handlers!['onAnyPayment'].pattern).toBe('payment.*');
      expect(handlers!['onAnyCompleted'].pattern).toBe('*.completed');
      expect(handlers!['onEverything'].pattern).toBe('*');
    });
  });

  describe('Mixed Handlers', () => {
    test('should share metadata storage with @MessagePattern on same class', () => {
      class TestHandler {
        @MessagePattern('order.create')
        create() {}

        @EventPattern('payment.completed')
        onPaymentCompleted() {}
      }

      const handlers = getTypedMetadata<Record<string, MessageHandlerMetadata>>(
        ComponentConstants.MessageHandlersKey,
        TestHandler,
      );

      expect(Object.keys(handlers!)).toHaveLength(2);
      expect(handlers!['create'].type).toBe('message');
      expect(handlers!['onPaymentCompleted'].type).toBe('event');
    });
  });
});
