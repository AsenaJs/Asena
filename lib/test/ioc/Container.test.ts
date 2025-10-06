import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Container } from '../../ioc';
import { Component } from '../../server/decorators';
import { Inject, PostConstruct, Strategy } from '../../ioc/component';
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

// Test classes for PostConstruct duplicate execution prevention
@Component()
class BaseServiceWithPostConstruct {

  private executionCount = 0;

  private log: string[] = [];

  @PostConstruct()
  public onStart() {
    this.executionCount++;
    this.log.push('base');
  }

  public getExecutionCount(): number {
    return this.executionCount;
  }

  public getLog(): string[] {
    return this.log;
  }

}

@Component()
class ChildServiceWithPostConstruct extends BaseServiceWithPostConstruct {
  // onStart inherited, not overridden
}

@Component()
class GrandChildServiceWithPostConstruct extends ChildServiceWithPostConstruct {
  // onStart inherited, not overridden
}

@Component()
class BaseWithAsyncPostConstruct {

  public isReady = false;

  public initTime = 0;

  @PostConstruct()
  public async initialize() {
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    this.isReady = true;
    this.initTime = Date.now();
  }

}

@Component()
class ChildWithAsyncPostConstruct extends BaseWithAsyncPostConstruct {
  // async initialize inherited
}

@Component()
class ParentWithPostConstruct {

  public log: string[] = [];

  @PostConstruct()
  public init() {
    this.log.push('parent');
  }

}

@Component()
class ChildWithOverridePostConstruct extends ParentWithPostConstruct {

  @PostConstruct()
  public override init() {
    super.init();
    this.log.push('child');
  }

}

describe('Container', () => {
  let container: Container;

  beforeEach(async () => {
    container = new Container();

    await container.register('TestClass', TestClass, true);
    await container.register('TestClass2', TestClass2, true);
    await container.register('TestClass3', TestClass3, true);

    await container.register('TestClass4', TestClass4, true);
    await container.register('TestInterface', TestClass4, true);

    await container.register('TestClass5', TestClass5, true);
    await container.register('TestInterface', TestClass5, true);

    await container.register('TestClass6', TestClass6, true);
  });

  test('should store components', () => {
    expect(Object.keys(container.services).length).toBe(7);
  });

  test('should set services', () => {
    container.services = { TestClass: { Class: TestClass, instance: null, singleton: true } };

    expect(Object.keys(container.services).length).toBe(1);
  });

  test('should register component', async () => {
    await container.register('TestClass7', TestClass7, true);

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
    await container.register('ExportedServerServiceTest', ExportedServerService, true);

    const exportedServerServiceTest = (await container.resolve('ExportedServerServiceTest')) as ExportedServerService;

    expect(exportedServerServiceTest).toBeInstanceOf(ExportedServerService);

    expect(exportedServerServiceTest.testValue).toBe('Test Value');
  });

  test('should not execute PostConstruct multiple times for inherited methods', async () => {
    await container.register('GrandChildServiceWithPostConstruct', GrandChildServiceWithPostConstruct, true);

    const instance = (await container.resolve(
      'GrandChildServiceWithPostConstruct',
    )) as GrandChildServiceWithPostConstruct;

    expect(instance).toBeInstanceOf(GrandChildServiceWithPostConstruct);
    // Should execute only once, not 3 times
    expect(instance.getExecutionCount()).toBe(1);
    expect(instance.getLog()).toEqual(['base']);
  });

  test('should not execute PostConstruct multiple times for child service', async () => {
    await container.register('ChildServiceWithPostConstruct', ChildServiceWithPostConstruct, true);

    const instance = (await container.resolve('ChildServiceWithPostConstruct')) as ChildServiceWithPostConstruct;

    expect(instance).toBeInstanceOf(ChildServiceWithPostConstruct);
    // Should execute only once, not 2 times
    expect(instance.getExecutionCount()).toBe(1);
  });

  test('should properly await async PostConstruct in singleton registration', async () => {
    const startTime = Date.now();

    await container.register('BaseWithAsyncPostConstruct', BaseWithAsyncPostConstruct, true);

    const instance = (await container.resolve('BaseWithAsyncPostConstruct')) as BaseWithAsyncPostConstruct;

    // Instance should be ready immediately since register awaited the PostConstruct
    expect(instance.isReady).toBe(true);
    expect(instance.initTime).toBeGreaterThan(0);

    // Verify that at least 100ms passed (async PostConstruct delay)
    const elapsedTime = Date.now() - startTime;

    expect(elapsedTime).toBeGreaterThanOrEqual(100);
  });

  test('should properly await async PostConstruct for inherited async methods', async () => {
    await container.register('ChildWithAsyncPostConstruct', ChildWithAsyncPostConstruct, true);

    const instance = (await container.resolve('ChildWithAsyncPostConstruct')) as ChildWithAsyncPostConstruct;

    expect(instance).toBeInstanceOf(ChildWithAsyncPostConstruct);
    expect(instance.isReady).toBe(true);
  });

  test('should execute overridden PostConstruct correctly', async () => {
    await container.register('ChildWithOverridePostConstruct', ChildWithOverridePostConstruct, true);

    const instance = (await container.resolve('ChildWithOverridePostConstruct')) as ChildWithOverridePostConstruct;

    expect(instance).toBeInstanceOf(ChildWithOverridePostConstruct);
    // Both parent and child should execute once
    expect(instance.log).toEqual(['parent', 'child']);
  });

  test('should create prototype instances with PostConstruct each time', async () => {
    await container.register('BaseServiceWithPostConstruct', BaseServiceWithPostConstruct, false);

    const instance1 = (await container.resolve('BaseServiceWithPostConstruct')) as BaseServiceWithPostConstruct;
    const instance2 = (await container.resolve('BaseServiceWithPostConstruct')) as BaseServiceWithPostConstruct;

    // Each instance should have executed PostConstruct once
    expect(instance1.getExecutionCount()).toBe(1);
    expect(instance2.getExecutionCount()).toBe(1);

    // They should be different instances
    expect(instance1).not.toBe(instance2);
  });

  test('should register external instance', async () => {
    class ExternalLogger {

      public constructor(public name: string) {}

      public log(message: string) {
        return `${this.name}: ${message}`;
      }
    
}

    const logger = new ExternalLogger('TestLogger');

    await container.registerInstance('Logger', logger);

    const resolved = (await container.resolve<ExternalLogger>('Logger')) as ExternalLogger;

    expect(resolved).toBe(logger);
    expect(resolved.name).toBe('TestLogger');
    expect(resolved.log('test')).toBe('TestLogger: test');
  });

  test('should throw error on duplicate instance registration', async () => {
    class TestInstance {

      public value = 'test';
    
}

    const instance = new TestInstance();

    await container.registerInstance('TestInstance', instance);

    expect(async () => {
      await container.registerInstance('TestInstance', instance);
    }).toThrow("Service 'TestInstance' is already registered");
  });

  test('should register and resolve primitive values as instances', async () => {
    const config = { apiKey: 'test-key', timeout: 3000 };

    await container.registerInstance('Config', config);

    const resolved = (await container.resolve<typeof config>('Config')) as typeof config;

    expect(resolved).toBe(config);
    expect(resolved.apiKey).toBe('test-key');
    expect(resolved.timeout).toBe(3000);
  });

  test('should register instance without dependency injection', async () => {
    class SimpleService {

      public value = 42;
    
}

    const service = new SimpleService();

    await container.registerInstance('SimpleService', service);

    const resolved = (await container.resolve<SimpleService>('SimpleService')) as SimpleService;

    expect(resolved).toBe(service);
    expect(resolved.value).toBe(42);
  });

  test('registered instance should work with other services as dependency', async () => {
    class LoggerService {

     public log(msg: string) {
        return `LOG: ${msg}`;
      }
    
}

    @Component()
    class UserService {

      @Inject('LoggerService')
      public logger: LoggerService;

      public getUser() {
        return this.logger.log('Getting user');
      }
    
}

    const logger = new LoggerService();

    await container.registerInstance('LoggerService', logger);
    await container.register('UserService', UserService, true);

    const userService = (await container.resolve<UserService>('UserService')) as UserService;

    expect(userService.logger).toBe(logger);
    expect(userService.getUser()).toBe('LOG: Getting user');
  });
});
