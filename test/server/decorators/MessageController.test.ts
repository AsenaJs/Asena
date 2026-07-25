import { describe, expect, test } from 'bun:test';
import { MessageController } from '../../../lib/server/decorators';
import { ComponentConstants, ComponentType } from '../../../lib/ioc';
import { Inject } from '../../../lib/ioc/component';
import { getTypedMetadata } from '../../../lib/utils';
import { DEFAULT_TRANSPORT_NAME } from '../../../lib/server/microservice';

describe('@MessageController Decorator', () => {
  describe('Class Registration', () => {
    test('should register class as MESSAGE_CONTROLLER component type', () => {
      @MessageController()
      class TestHandler {}

      const metadata = getTypedMetadata<boolean>(ComponentType.MESSAGE_CONTROLLER, TestHandler);
      expect(metadata).toBe(true);
    });

    test('should mark class as IOC object', () => {
      @MessageController()
      class TestHandler {}

      const isIOC = getTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, TestHandler);
      expect(isIOC).toBe(true);
    });

    test('should register with default name as class name', () => {
      @MessageController()
      class TestHandler {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestHandler);
      expect(name).toBe('TestHandler');
    });
  });

  describe('Prefix Metadata', () => {
    test('should store prefix from object params', () => {
      @MessageController({ prefix: 'order' })
      class OrderHandler {}

      const prefix = getTypedMetadata<string>(ComponentConstants.MessagePrefixKey, OrderHandler);
      expect(prefix).toBe('order');
    });

    test('should treat string shorthand as prefix, not component name', () => {
      @MessageController('order')
      class OrderHandler {}

      const prefix = getTypedMetadata<string>(ComponentConstants.MessagePrefixKey, OrderHandler);
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, OrderHandler);

      expect(prefix).toBe('order');
      expect(name).toBe('OrderHandler');
    });

    test('should store empty string when no prefix', () => {
      @MessageController()
      class GlobalHandler {}

      const prefix = getTypedMetadata<string>(ComponentConstants.MessagePrefixKey, GlobalHandler);
      expect(prefix).toBe('');
    });
  });

  describe('Transport Binding', () => {
    test('should default to the default transport name', () => {
      @MessageController('order')
      class OrderHandler {}

      const transport = getTypedMetadata<string>(ComponentConstants.MessageTransportKey, OrderHandler);
      expect(transport).toBe(DEFAULT_TRANSPORT_NAME);
    });

    test('should store named transport binding', () => {
      @MessageController({ prefix: 'metrics', transport: 'analytics' })
      class AnalyticsHandler {}

      const transport = getTypedMetadata<string>(ComponentConstants.MessageTransportKey, AnalyticsHandler);
      expect(transport).toBe('analytics');
    });

    test('should default transport when object params omit it', () => {
      @MessageController({ prefix: 'order' })
      class OrderHandler {}

      const transport = getTypedMetadata<string>(ComponentConstants.MessageTransportKey, OrderHandler);
      expect(transport).toBe(DEFAULT_TRANSPORT_NAME);
    });
  });

  describe('Name Parameter', () => {
    test('should support custom name in object params', () => {
      @MessageController({ name: 'CustomHandler', prefix: 'custom' })
      class MyHandler {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, MyHandler);
      expect(name).toBe('CustomHandler');
    });
  });

  describe('Integration', () => {
    test('should work with @Inject decorator', () => {
      @MessageController({ prefix: 'order' })
      class OrderHandler {
        @Inject('SomeService')
        // @ts-ignore
        private someService!: any;
      }

      const prefix = getTypedMetadata<string>(ComponentConstants.MessagePrefixKey, OrderHandler);
      expect(prefix).toBe('order');

      const dependencies = getTypedMetadata<Record<string, string>>(ComponentConstants.DependencyKey, OrderHandler);
      expect(dependencies).toBeDefined();
      expect(dependencies['someService']).toBe('SomeService');
    });
  });
});
