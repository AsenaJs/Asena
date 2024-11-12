import { beforeEach, describe, expect, test } from 'bun:test';
import { IocEngine } from '../../ioc';
import type { Component as ComponentType } from '../../ioc/types';
import { Scope } from '../../ioc/types';
import { Component } from '../../server/decorators';
import { Inject } from '../../ioc/component/decorators';
import { ExportedTestService } from './src/ExportedTestService';
import { ExportedTestController } from './src/ExportedTestController';

@Component({
  name: 'TestService',
  scope: Scope.SINGLETON,
})
class TestService {

  public getValue(): string {
    return 'test';
  }

}

@Component({
  name: 'TestController',
  scope: Scope.SINGLETON,
})
class TestController {

  @Inject(TestService)
  private testService: TestService;

  public getData(): string {
    return this.testService.getValue();
  }

}

describe('IocEngine', () => {
  let iocEngine: IocEngine;

  beforeEach(() => {
    iocEngine = new IocEngine();
  });

  test('should create instance', () => {
    expect(iocEngine).toBeDefined();
    expect(iocEngine.container).toBeDefined();
  });

  test('should register components manually', async () => {
    const components: ComponentType[] = [
      { Class: TestService, interface: null },
      { Class: TestController, interface: null },
    ];

    await iocEngine.searchAndRegister(components);

    const testService = iocEngine.container.get<TestService>(TestService.name);
    const testController = iocEngine.container.get<TestController>(TestController.name);

    expect(testService).toBeInstanceOf(TestService);
    expect(testController).toBeInstanceOf(TestController);
    expect((testController as TestController).getData()).toBe('test');
  });

  test('should register components automatically', async () => {
    iocEngine = new IocEngine({ sourceFolder: 'lib/test/ioc/src' });
    await iocEngine.searchAndRegister();
    const testService = iocEngine.container.get<ExportedTestService>('ExportedTestService');
    const testController = iocEngine.container.get<ExportedTestController>('ExportedTestController');

    expect(testService).toBeInstanceOf(ExportedTestService);
    expect(testController).toBeInstanceOf(ExportedTestController);
    expect((testController as ExportedTestController).getData()).toBe('test');
  });

  test('should throw error when no components provided', async () => {
    try {
      await iocEngine.searchAndRegister();
      expect(true).toBe(false);
    } catch (error) {
      expect(error.message).toBe('No components or configuration found');
    }
  });
});
