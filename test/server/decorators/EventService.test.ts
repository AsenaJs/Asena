import { describe, expect, test } from 'bun:test';
import { EventService } from '../../../lib/server/decorators';
import { ComponentConstants, ComponentType } from '../../../lib/ioc';
import { Inject } from '../../../lib/ioc/component';
import { getTypedMetadata } from '../../../lib/utils';

describe('@EventService Decorator', () => {
  describe('Class Registration', () => {
    test('should register class as EVENT component type', () => {
      @EventService()
      class TestEventService {}

      const metadata = getTypedMetadata<boolean>(ComponentType.EVENT, TestEventService);
      expect(metadata).toBe(true);
    });

    test('should mark class as IOC object', () => {
      @EventService()
      class TestEventService {}

      const isIOC = getTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, TestEventService);
      expect(isIOC).toBe(true);
    });

    test('should register with default name as class name', () => {
      @EventService()
      class TestEventService {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestEventService);
      expect(name).toBe('TestEventService');
    });
  });

  describe('Prefix Metadata', () => {
    test('should store prefix from object params', () => {
      @EventService({ prefix: 'user' })
      class UserEventService {}

      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, UserEventService);
      expect(prefix).toBe('user');
    });

    test('should store prefix from string shorthand', () => {
      @EventService('download')
      class DownloadEventService {}

      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, DownloadEventService);
      expect(prefix).toBe('download');
    });

    test('should store empty string when no prefix', () => {
      @EventService()
      class GlobalEventService {}

      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, GlobalEventService);
      expect(prefix).toBe('');
    });

    test('should store empty string when prefix is undefined in object', () => {
      @EventService({ prefix: undefined })
      class GlobalEventService {}

      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, GlobalEventService);
      expect(prefix).toBe('');
    });
  });

  describe('Name Parameter', () => {
    test('should support custom name in object params', () => {
      @EventService({ name: 'CustomEventService', prefix: 'custom' })
      class MyEventService {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, MyEventService);
      expect(name).toBe('CustomEventService');
    });

    test('should use class name when name is undefined', () => {
      @EventService({ prefix: 'test' })
      class TestEventService {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestEventService);
      expect(name).toBe('TestEventService');
    });

    test('should prioritize custom name over class name', () => {
      @EventService({ name: 'CustomName' })
      class OriginalName {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, OriginalName);
      expect(name).toBe('CustomName');
    });
  });

  describe('Integration', () => {
    test('should work with @Inject decorator', () => {
      @EventService({ prefix: 'user' })
      class UserEventService {
        @Inject('SomeService')
        // @ts-ignore
        private someService!: any;
      }

      // Should not throw
      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, UserEventService);
      expect(prefix).toBe('user');

      const dependencies = getTypedMetadata<Record<string, string>>(ComponentConstants.DependencyKey, UserEventService);
      expect(dependencies).toBeDefined();

      expect(dependencies['someService']).toBe('SomeService');
    });

    test('should initialize dependency and strategy metadata', () => {
      @EventService()
      class TestEventService {}

      const dependencies = getTypedMetadata<Record<string, string>>(ComponentConstants.DependencyKey, TestEventService);
      const strategies = getTypedMetadata<Record<string, string>>(ComponentConstants.StrategyKey, TestEventService);

      expect(dependencies).toBeDefined();
      expect(strategies).toBeDefined();
      expect(typeof dependencies).toBe('object');
      expect(typeof strategies).toBe('object');
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle all parameters together', () => {
      @EventService({ prefix: 'order', name: 'OrderEvents' })
      class OrderEventService {}

      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, OrderEventService);
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, OrderEventService);
      const isEvent = getTypedMetadata<boolean>(ComponentType.EVENT, OrderEventService);

      expect(prefix).toBe('order');
      expect(name).toBe('OrderEvents');
      expect(isEvent).toBe(true);
    });

    test('should support empty string prefix explicitly', () => {
      @EventService({ prefix: '' })
      class GlobalEventService {}

      const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, GlobalEventService);
      expect(prefix).toBe('');
    });
  });
});
