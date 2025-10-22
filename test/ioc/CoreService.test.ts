import { describe, expect, test } from 'bun:test';
import type { ICoreService } from '../../lib/ioc';
import { CORE_SERVICE, CoreService } from '../../lib/ioc';
import { getTypedMetadata } from '../../lib/utils/typedMetadata';
import { ComponentConstants } from '../../lib/ioc/constants';
import { Scope } from '../../lib/ioc/component';

describe('CoreService Decorator', () => {
  test('should set correct metadata with custom name', () => {
    @CoreService('TestService')
    class TestClass implements ICoreService {
      public serviceName = 'TestService';
    }

    const isCoreService = getTypedMetadata(CORE_SERVICE, TestClass);
    const name = getTypedMetadata(ComponentConstants.NameKey, TestClass);
    const scope = getTypedMetadata(ComponentConstants.ScopeKey, TestClass);

    expect(isCoreService).toBe(true);
    expect(name).toBe('TestService');
    expect(scope).toBe(Scope.SINGLETON);
  });

  test('should use class name when name parameter is not provided', () => {
    @CoreService()
    class MyCustomService implements ICoreService {
      public serviceName = 'MyCustomService';
    }

    const name = getTypedMetadata(ComponentConstants.NameKey, MyCustomService);

    expect(name).toBe('MyCustomService');
  });

  test('should always set singleton scope', () => {
    @CoreService('SingletonTest')
    class SingletonService implements ICoreService {
      public serviceName = 'SingletonTest';
    }

    const scope = getTypedMetadata(ComponentConstants.ScopeKey, SingletonService);

    expect(scope).toBe(Scope.SINGLETON);
  });
});

describe('ICoreService Interface', () => {
  test('should allow implementation with required fields', () => {
    class BasicCoreService implements ICoreService {
      public serviceName = 'BasicService';
    }

    const service = new BasicCoreService();

    expect(service.serviceName).toBe('BasicService');
  });

  test('should allow optional lifecycle hooks', () => {
    class ServiceWithHooks implements ICoreService {
      public serviceName = 'HookedService';

      public initialized = false;

      public destroyed = false;

      public onInit(): void {
        this.initialized = true;
      }

      public onDestroy(): void {
        this.destroyed = true;
      }
    }

    const service = new ServiceWithHooks();

    service.onInit?.();
    service.onDestroy?.();

    expect(service.initialized).toBe(true);
    expect(service.destroyed).toBe(true);
  });

  test('should allow async lifecycle hooks', async () => {
    class AsyncService implements ICoreService {
      public serviceName = 'AsyncService';

      public data = '';

      public async onInit(): Promise<void> {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        this.data = 'initialized';
      }

      public async onDestroy(): Promise<void> {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        this.data = 'destroyed';
      }
    }

    const service = new AsyncService();

    await service.onInit?.();
    expect(service.data).toBe('initialized');

    await service.onDestroy?.();
    expect(service.data).toBe('destroyed');
  });
});
