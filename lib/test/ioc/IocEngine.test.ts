import { beforeEach, describe, expect, test } from 'bun:test';
import { IocEngine } from '../../ioc';
import type { Component as ComponentType } from '../../ioc/types';
import { Scope } from '../../ioc/types';
import { Component } from '../../server/decorators';
import { Inject } from '../../ioc/component';
import { ExportedTestServiceTest } from '../example-app-structure/service/ExportedTestService.test';
import { ExportedTestControllerTest } from '../example-app-structure/controller/ExportedTestController.test';
import type { AsenaContext } from '../../adapter';
import { createMockContextTest } from '../utils/createMockContext.test';

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

@Component({
  name: 'TestService2',
  scope: Scope.SINGLETON,
})
class TestService2 extends TestService {

  public getValue(): string {
    return 'test';
  }

}

describe('IocEngine', () => {
  let iocEngine: IocEngine;
  let mockContext: AsenaContext<Request, Response>;

  beforeEach(() => {
    iocEngine = new IocEngine();
    mockContext = createMockContextTest();
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

    const testService = await iocEngine.container.resolve<TestService>(TestService.name);
    const testController = await iocEngine.container.resolve<TestController>(TestController.name);

    expect(testService).toBeInstanceOf(TestService);
    expect(testController).toBeInstanceOf(TestController);
    expect((testController as TestController).getData()).toBe('test');
  });

  test('should register components automatically', async () => {
    iocEngine = new IocEngine({ sourceFolder: 'lib/test/example-app-structure' });
    await iocEngine.searchAndRegister();
    const testService = await iocEngine.container.resolve<ExportedTestServiceTest>('ExportedTestService');
    const testController = await iocEngine.container.resolve<ExportedTestControllerTest>('ExportedTestController');

    expect(testService).toBeInstanceOf(ExportedTestServiceTest);
    expect(testController).toBeInstanceOf(ExportedTestControllerTest);
    expect((testController as ExportedTestControllerTest).getData(mockContext)).toBeInstanceOf(Response);
  });

  test('should throw error when no components provided', async () => {
    try {
      await iocEngine.searchAndRegister();
      expect(true).toBe(false);
    } catch (error) {
      expect(error.message).toBe('No components or configuration found');
    }
  });

  test('should register dependencies correct when extending class', async () => {
    const components: ComponentType[] = [
      { Class: TestService2, interface: null },
      { Class: TestController, interface: null },
      { Class: TestService, interface: null },
    ];

    await iocEngine.searchAndRegister(components);

    const testService = await iocEngine.container.resolve<TestService>(TestService.name);
    const testService2 = await iocEngine.container.resolve<TestService2>(TestService2.name);

    expect(testService).toBeInstanceOf(TestService);
    expect(testService2).toBeInstanceOf(TestService2);

    expect((testService2 as TestService2).getValue()).toBe('test');
  });
});
