import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Container } from '../../ioc';
import { Component } from '../../server/decorators';
import { Inject, Strategy } from '../../ioc/component';
import { ComponentType } from '../../ioc/types';
import { ExportedServerService } from '../example-app-structure/database/ExportedServerService.test';

@Component()
class TestClass {

  public testMethod() {
    return 'test';
  }

}

@Component()
class TestClass2 {

  @Inject(TestClass)
  private testClass: TestClass;

  public testMethod() {
    return this.testClass.testMethod();
  }

}

@Component()
class TestClass3 {

  @Inject(TestClass)
  private testClass: TestClass;

  @Inject(TestClass2)
  private testClass2: TestClass2;

  public testMethod() {
    return this.testClass.testMethod() + '-' + this.testClass2.testMethod();
  }

}

interface TestInterface {
  testMethod: () => string;
}

@Component()
class TestClass4 implements TestInterface {

  public testMethod() {
    return 'test';
  }

}

@Component()
class TestClass5 implements TestInterface {

  @Inject(TestClass4)
  private testClass4: TestClass4;

  public testMethod() {
    return this.testClass4.testMethod();
  }

}

@Component()
class TestClass6 {

  @Strategy('TestInterface')
  public services: TestInterface[];

  public testMethod() {
    return this.services.map((service) => service.testMethod()).join('-');
  }

}

@Component()
class TestClass7 {

  public testMethod() {
    return 'test';
  }

}

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();

    container.register('TestClass', TestClass, true);
    container.register('TestClass2', TestClass2, true);
    container.register('TestClass3', TestClass3, true);

    container.register('TestClass4', TestClass4, true);
    container.register('TestInterface', TestClass4, true);

    container.register('TestClass5', TestClass5, true);
    container.register('TestInterface', TestClass5, true);

    container.register('TestClass6', TestClass6, true);
  });

  test('should store components', () => {
    expect(Object.keys(container.services).length).toBe(7);
  });

  test('should set services', () => {
    container.services = { TestClass: { Class: TestClass, instance: null, singleton: true } };

    expect(Object.keys(container.services).length).toBe(1);
  });

  test('should register component', async () => {
    container.register('TestClass7', TestClass7, true);

    expect(await container.resolve('TestClass7')).toBeInstanceOf(TestClass7);
  });

  test('should prepare instance', async () => {
    container.services = { TestClass: { Class: TestClass, instance: null, singleton: false } };

    // @ts-ignore
    const spy = spyOn(container, 'prepareInstance');

    expect(await container.resolve('TestClass')).toBeInstanceOf(TestClass);

    expect(spy).toBeCalled();

    expect(spy).toHaveBeenCalledWith(TestClass);
  });

  test('should inject dependency', async () => {
    const testClass3 = (await container.resolve<TestClass3>('TestClass3')) as TestClass3;

    expect(testClass3).toBeInstanceOf(TestClass3);

    expect(testClass3.testMethod()).toBe('test-test');
  });

  test('should inject strategy', async () => {
    const testClass6 = (await container.resolve('TestClass6')) as TestClass6;

    expect(testClass6.services.length).toBe(2);

    expect(testClass6.testMethod()).toBe('test-test');
  });

  test('should getAll component', async () => {
    const services = await container.resolveAll(ComponentType.COMPONENT);

    expect(services).toBeInstanceOf(Array);
  });

  test('should getStrategy components', async () => {
    const services = await container.resolveStrategy('TestInterface');

    expect(services).toBeInstanceOf(Array);
    expect(services.length).toBe(2);

    for (const service of services) {
      expect(service).toHaveProperty('testMethod');
    }
  });

  test('should not have memory leak when creating and destroying components', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      let instance = (await container.resolve('TestClass3')) as TestClass3;

      expect(instance).toBeInstanceOf(TestClass3);

      instance.testMethod();

      (instance as any) = null;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    const finalMemory = process.memoryUsage().heapUsed;

    console.log('Memory used:', (finalMemory - initialMemory) / 1024);

    // less than 1MB is okay
    expect(finalMemory - initialMemory).toBeLessThan(1024 * 1024);
  });

  test('should execute PostConstruct method', async () => {
    container.register('ExportedServerServiceTest', ExportedServerService, true);

    const exportedServerServiceTest = (await container.resolve(
      'ExportedServerServiceTest',
    )) as ExportedServerService;

    expect(exportedServerServiceTest).toBeInstanceOf(ExportedServerService);

    expect(exportedServerServiceTest.testValue).toBe('Test Value');
  });
});
