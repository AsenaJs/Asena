import { describe, expect, test } from 'bun:test';
import { FrontendController } from '../../../lib/server/decorators';
import { ComponentConstants, ComponentType } from '../../../lib/ioc';
import { Inject } from '../../../lib/ioc/component';
import { getOwnTypedMetadata, getTypedMetadata } from '../../../lib/utils';

describe('@FrontendController Decorator', () => {
  describe('Class Registration', () => {
    test('should register class as FRONTEND_CONTROLLER component type', () => {
      @FrontendController('/ui')
      class TestFrontendController {}

      const metadata = getTypedMetadata<boolean>(ComponentType.FRONTEND_CONTROLLER, TestFrontendController);

      expect(metadata).toBe(true);
    });

    test('should mark class as IOC object', () => {
      @FrontendController('/ui')
      class TestFrontendController {}

      const isIOC = getTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, TestFrontendController);

      expect(isIOC).toBe(true);
    });

    test('should register with class name as default name', () => {
      @FrontendController('/ui')
      class TestFrontendController {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestFrontendController);

      expect(name).toBe('TestFrontendController');
    });
  });

  describe('Path Metadata', () => {
    test('should store path from string parameter', () => {
      @FrontendController('/dashboard')
      class DashboardController {}

      const path = getOwnTypedMetadata<string>(ComponentConstants.PathKey, DashboardController);

      expect(path).toBe('/dashboard');
    });

    test('should store path from object parameter', () => {
      @FrontendController({ path: '/admin' })
      class AdminController {}

      const path = getOwnTypedMetadata<string>(ComponentConstants.PathKey, AdminController);

      expect(path).toBe('/admin');
    });

    test('should normalize path with multiple leading slashes', () => {
      @FrontendController('///ui')
      class TestController {}

      const path = getOwnTypedMetadata<string>(ComponentConstants.PathKey, TestController);

      expect(path).toBe('/ui');
    });

    test('should default path to / when empty', () => {
      @FrontendController({ path: '' })
      class TestController {}

      const path = getOwnTypedMetadata<string>(ComponentConstants.PathKey, TestController);

      expect(path).toBe('/');
    });
  });

  describe('Name Parameter', () => {
    test('should support custom name in object params', () => {
      @FrontendController({ path: '/ui', name: 'CustomFrontend' })
      class MyFrontendController {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, MyFrontendController);

      expect(name).toBe('CustomFrontend');
    });

    test('should use class name when name is undefined', () => {
      @FrontendController({ path: '/ui' })
      class TestFrontendController {}

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestFrontendController);

      expect(name).toBe('TestFrontendController');
    });
  });

  describe('Integration', () => {
    test('should work with @Inject decorator', () => {
      @FrontendController('/ui')
      class TestFrontendController {
        @Inject('SomeService')
        // @ts-ignore
        private someService!: any;
      }

      const isFrontendController = getTypedMetadata<boolean>(ComponentType.FRONTEND_CONTROLLER, TestFrontendController);

      expect(isFrontendController).toBe(true);

      const dependencies = getTypedMetadata<Record<string, string>>(
        ComponentConstants.DependencyKey,
        TestFrontendController,
      );

      expect(dependencies).toBeDefined();
      expect(dependencies['someService']).toBe('SomeService');
    });

    test('should initialize dependency and strategy metadata', () => {
      @FrontendController('/ui')
      class TestFrontendController {}

      const dependencies = getTypedMetadata<Record<string, string>>(
        ComponentConstants.DependencyKey,
        TestFrontendController,
      );

      const strategies = getTypedMetadata<Record<string, string>>(
        ComponentConstants.StrategyKey,
        TestFrontendController,
      );

      expect(dependencies).toBeDefined();
      expect(strategies).toBeDefined();
      expect(typeof dependencies).toBe('object');
      expect(typeof strategies).toBe('object');
    });
  });
});
