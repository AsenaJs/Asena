import { describe, expect, mock, test } from 'bun:test';
import type { ComponentPostProcessor, InjectableComponent } from '../../lib/ioc';
import { ComponentType, Container, IocEngine } from '../../lib/ioc';
import { Component } from '../../lib/ioc/component/decorators/Component';
import { Inject, PostConstruct, Scope } from '../../lib/ioc/component';
import { Controller, PostProcessor } from '../../lib/server/decorators';
import { getTypedMetadata } from '../../lib/utils';

// --- Test Components ---

@Component({ name: 'SimpleService', scope: Scope.SINGLETON })
class SimpleService {
  public getValue(): string {
    return 'original';
  }
}

@Component({ name: 'AnotherService', scope: Scope.SINGLETON })
class AnotherService {
  public getData(): string {
    return 'another';
  }
}

// --- PostProcessor that wraps instances with Proxy (Mode 1) ---

@PostProcessor({ name: 'ProxyPostProcessor' })
class ProxyPostProcessor implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    return new Proxy(instance as object, {
      get(target: any, prop: string) {
        if (prop === '__proxied__') return true;

        return target[prop];
      },
    }) as T;
  }
}

// --- PostProcessor that collects metadata (Mode 2) ---

const collectedClasses: string[] = [];

@PostProcessor({ name: 'MetadataPostProcessor' })
class MetadataPostProcessor implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    collectedClasses.push(Class.name);

    return instance; // unchanged
  }
}

// --- PostProcessor with DI ---

@Component({ name: 'HelperService', scope: Scope.SINGLETON })
class HelperService {
  public getPrefix(): string {
    return 'PP';
  }
}

@PostProcessor({ name: 'DIPostProcessor' })
class DIPostProcessor implements ComponentPostProcessor {
  @Inject('HelperService')
  private helper: HelperService;

  public postProcess<T>(instance: T, Class: any): T {
    // Verify DI works by accessing injected service
    if (this.helper && typeof (instance as any).__diTag === 'undefined') {
      Object.defineProperty(instance as object, '__diTag', {
        value: this.helper.getPrefix(),
        enumerable: true,
      });
    }

    return instance;
  }
}

// --- PostProcessor that throws ---

@PostProcessor({ name: 'ErrorPostProcessor' })
class ErrorPostProcessor implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    throw new Error('PostProcessor failed');
  }
}

// --- PostProcessor ordering (FIFO) ---

const orderLog: string[] = [];

@PostProcessor({ name: 'FirstPP' })
class FirstPP implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    orderLog.push('first');

    return instance;
  }
}

@PostProcessor({ name: 'SecondPP' })
class SecondPP implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    orderLog.push('second');

    return instance;
  }
}

// --- Helper to create IocEngine with mock logger ---

function createIocEngine(): IocEngine {
  const engine = new IocEngine();
  const container = new Container();

  (engine as any)['_container'] = container;
  (engine as any)['logger'] = {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    profile: mock(() => {}),
  };

  return engine;
}

// --- Tests ---

describe('PostProcessor', () => {
  describe('Container.prepareInstance() hook', () => {
    test('should work normally without any PostProcessor (regression)', async () => {
      const container = new Container();

      await container.register('SimpleService', SimpleService, true);

      const instance = await container.resolve<SimpleService>('SimpleService');

      expect(instance).toBeInstanceOf(SimpleService);
      expect((instance as SimpleService).getValue()).toBe('original');
    });

    test('should apply PostProcessor to new instances', async () => {
      const container = new Container();

      // Register PostProcessor first
      const pp = new ProxyPostProcessor();

      container.registerPostProcessor(pp);

      // Now register a service
      await container.register('SimpleService', SimpleService, true);

      const instance = await container.resolve<SimpleService>('SimpleService');

      expect((instance as any).__proxied__).toBe(true);
      expect((instance as SimpleService).getValue()).toBe('original');
    });

    test('should not affect instances created before PostProcessor registration', async () => {
      const container = new Container();

      // Register service BEFORE PostProcessor
      await container.register('SimpleService', SimpleService, true);

      const instanceBefore = await container.resolve<SimpleService>('SimpleService');

      // Now register PostProcessor
      const pp = new ProxyPostProcessor();

      container.registerPostProcessor(pp);

      // Resolve again - singleton returns same (unprocessed) instance
      const instanceAfter = await container.resolve<SimpleService>('SimpleService');

      expect((instanceBefore as any).__proxied__).toBeUndefined();
      expect(instanceBefore).toBe(instanceAfter); // same singleton
    });

    test('should run multiple PostProcessors in FIFO order', async () => {
      orderLog.length = 0;
      const container = new Container();

      container.registerPostProcessor(new FirstPP());
      container.registerPostProcessor(new SecondPP());

      await container.register('SimpleService', SimpleService, true);

      expect(orderLog).toEqual(['first', 'second']);
    });

    test('should keep original instance when postProcess returns same instance (Mode 2)', async () => {
      collectedClasses.length = 0;
      const container = new Container();

      container.registerPostProcessor(new MetadataPostProcessor());

      await container.register('SimpleService', SimpleService, true);

      const instance = await container.resolve<SimpleService>('SimpleService');

      expect(instance).toBeInstanceOf(SimpleService);
      expect((instance as SimpleService).getValue()).toBe('original');
      expect(collectedClasses).toContain('SimpleService');
    });

    test('should keep original instance when postProcess returns null/undefined', async () => {
      const nullPP: ComponentPostProcessor = {
        postProcess: () => null as any,
      };

      const container = new Container();

      container.registerPostProcessor(nullPP);

      await container.register('SimpleService', SimpleService, true);

      const instance = await container.resolve<SimpleService>('SimpleService');

      // ?? operator in prepareInstance should keep original
      expect(instance).toBeInstanceOf(SimpleService);
      expect((instance as SimpleService).getValue()).toBe('original');
    });

    test('should fail-fast when postProcess throws an error', async () => {
      const container = new Container();

      container.registerPostProcessor(new ErrorPostProcessor());

      await expect(container.register('SimpleService', SimpleService, true)).rejects.toThrow('PostProcessor failed');
    });
  });

  describe('IocEngine two-phase registration', () => {
    test('should register PostProcessor before other components', async () => {
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: SimpleService, interface: null },
        { Class: ProxyPostProcessor, interface: null },
      ];

      await engine.searchAndRegister(components);

      // SimpleService should be proxied (PostProcessor was active during its creation)
      const instance = await engine.container.resolve<SimpleService>('SimpleService');

      expect((instance as any).__proxied__).toBe(true);
    });

    test('should not post-process PostProcessor dependencies (Phase A guarantee)', async () => {
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: HelperService, interface: null },
        { Class: DIPostProcessor, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      // HelperService is a Phase A dependency - should NOT be post-processed
      const helper = await engine.container.resolve<HelperService>('HelperService');

      expect((helper as any).__diTag).toBeUndefined(); // NOT post-processed

      // SimpleService is Phase B - should be post-processed
      const simple = await engine.container.resolve<SimpleService>('SimpleService');

      expect((simple as any).__diTag).toBe('PP'); // post-processed by DIPostProcessor
    });

    test('should log warning for Phase A non-PostProcessor dependencies', async () => {
      const engine = createIocEngine();
      const logger = (engine as any)['logger'];

      const components: InjectableComponent[] = [
        { Class: HelperService, interface: null },
        { Class: DIPostProcessor, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      expect(logger.warn).toHaveBeenCalled();

      const warnCall = (logger.warn as any).mock.calls.find(
        (call: any[]) => call[0]?.includes('HelperService') && call[0]?.includes('will not be post-processed'),
      );

      expect(warnCall).toBeTruthy();
    });

    test('should work with no PostProcessors at all (regression)', async () => {
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: SimpleService, interface: null },
        { Class: AnotherService, interface: null },
      ];

      await engine.searchAndRegister(components);

      const simple = await engine.container.resolve<SimpleService>('SimpleService');
      const another = await engine.container.resolve<AnotherService>('AnotherService');

      expect((simple as SimpleService).getValue()).toBe('original');
      expect((another as AnotherService).getData()).toBe('another');
    });

    test('PostProcessor should be able to inject CoreServices', async () => {
      const engine = createIocEngine();

      // Simulate CoreService registration (Logger is already injected via mock in createIocEngine)
      // HelperService acts as a "pre-registered" dependency
      const components: InjectableComponent[] = [
        { Class: HelperService, interface: null },
        { Class: DIPostProcessor, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      // DIPostProcessor injected HelperService successfully and tagged SimpleService
      const simple = await engine.container.resolve<SimpleService>('SimpleService');

      expect((simple as any).__diTag).toBe('PP');
    });

    test('should handle multiple PostProcessors in FIFO order via IocEngine', async () => {
      orderLog.length = 0;
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: FirstPP, interface: null },
        { Class: SecondPP, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      // Both should have run in order during SimpleService creation
      expect(orderLog).toContain('first');
      expect(orderLog).toContain('second');

      const firstIdx = orderLog.lastIndexOf('first');
      const secondIdx = orderLog.lastIndexOf('second');

      expect(firstIdx).toBeLessThan(secondIdx);
    });

    test('should work with PP that has no dependencies (no Phase A deps)', async () => {
      const engine = createIocEngine();
      const logger = (engine as any)['logger'];

      const components: InjectableComponent[] = [
        { Class: ProxyPostProcessor, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      const instance = await engine.container.resolve<SimpleService>('SimpleService');

      expect((instance as any).__proxied__).toBe(true);
      // No warning should be logged (no deps pulled into Phase A)
      const warnCalls = (logger.warn as any).mock.calls.filter((call: any[]) =>
        call[0]?.includes('will not be post-processed'),
      );

      expect(warnCalls.length).toBe(0);
    });

    test('should execute PostConstruct on PostProcessor during Phase A', async () => {
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: PostConstructPP, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      // PostConstruct should have run - PP tags instances with '__pcInit'
      const instance = await engine.container.resolve<SimpleService>('SimpleService');

      expect((instance as any).__pcInit).toBe(true);
    });
  });

  describe('Container - additional edge cases', () => {
    test('should run PP on every resolve for transient scope', async () => {
      let ppCallCount = 0;
      const countingPP: ComponentPostProcessor = {
        postProcess<T>(instance: T): T {
          ppCallCount++;

          return instance;
        },
      };

      const container = new Container();

      container.registerPostProcessor(countingPP);
      // Register as non-singleton (transient) - prepareInstance called on each resolve
      await container.register('TransientService', TransientService, false);

      const inst1 = await container.resolve<TransientService>('TransientService');
      const inst2 = await container.resolve<TransientService>('TransientService');

      // Transient: prepareInstance called on each resolve → PP runs each time
      expect(ppCallCount).toBe(2);
      expect(inst1).not.toBe(inst2); // different instances
    });

    test('should handle async postProcess correctly', async () => {
      const container = new Container();

      container.registerPostProcessor(new AsyncPP());
      await container.register('SimpleService', SimpleService, true);

      const instance = await container.resolve<SimpleService>('SimpleService');

      expect((instance as any).__async).toBe(true);
      expect((instance as SimpleService).getValue()).toBe('original');
    });

    test('should chain PP results - PP2 receives PP1 output', async () => {
      const container = new Container();

      container.registerPostProcessor(new ChainPP1());
      container.registerPostProcessor(new ChainPP2());

      await container.register('SimpleService', SimpleService, true);

      const instance = await container.resolve<SimpleService>('SimpleService');

      expect((instance as any).__pp1).toBe(true);
      expect((instance as any).__pp2).toBe(true);
      // PP2 should have seen PP1's marker
      expect((instance as any).__pp2SawPp1).toBe(true);
    });

    test('should post-process all registered services', async () => {
      const processed: string[] = [];
      const trackAllPP: ComponentPostProcessor = {
        postProcess<T>(instance: T, Class: any): T {
          processed.push(Class.name);

          return instance;
        },
      };

      const container = new Container();

      container.registerPostProcessor(trackAllPP);
      await container.register('SimpleService', SimpleService, true);
      await container.register('AnotherService', AnotherService, true);

      expect(processed).toContain('SimpleService');
      expect(processed).toContain('AnotherService');
    });
  });

  describe('Real-world scenarios', () => {
    test('OTel-like: method call tracing via Proxy', async () => {
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: TracingPP, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      const service = (await engine.container.resolve<SimpleService>('SimpleService')) as SimpleService;

      // Call method multiple times
      expect(service.getValue()).toBe('original');
      expect(service.getValue()).toBe('original');
      expect(service.getValue()).toBe('original');

      // Verify tracing recorded the calls
      const callCounts = (service as any).__callCounts as Map<string, number>;

      expect(callCounts).toBeDefined();
      expect(callCounts.get('getValue')).toBe(3);
    });

    test('OpenAPI-like: selective metadata collection from controllers only', async () => {
      apiRegistry.clear();
      const engine = createIocEngine();

      const components: InjectableComponent[] = [
        { Class: OpenApiPP, interface: null },
        { Class: TestController, interface: null },
        { Class: SimpleService, interface: null },
      ];

      await engine.searchAndRegister(components);

      // Only TestController should be collected (it has CONTROLLER metadata)
      expect(apiRegistry.has('TestController')).toBe(true);
      expect(apiRegistry.has('SimpleService')).toBe(false);

      // Should have collected the method names
      const methods = apiRegistry.get('TestController');

      expect(methods).toContain('getUsers');
      expect(methods).toContain('createUser');
    });
  });
});

// ====== Additional Test Components ======

@Component({ name: 'TransientService' })
class TransientService {
  public counter = Math.random();
}

// PP with PostConstruct
let postConstructCalled = false;

@PostProcessor({ name: 'PostConstructPP' })
class PostConstructPP implements ComponentPostProcessor {
  private initialized = false;

  @PostConstruct()
  public init(): void {
    this.initialized = true;
    postConstructCalled = true;
  }

  public postProcess<T>(instance: T, Class: any): T {
    if (this.initialized) {
      Object.defineProperty(instance as object, '__pcInit', { value: true, enumerable: true });
    }

    return instance;
  }
}

// Async PP
@PostProcessor({ name: 'AsyncPP' })
class AsyncPP implements ComponentPostProcessor {
  public async postProcess<T>(instance: T, Class: any): Promise<T> {
    await new Promise((r) => setTimeout(r, 1));
    Object.defineProperty(instance as object, '__async', { value: true, enumerable: true });

    return instance;
  }
}

// Chain PP1 - adds __pp1 marker
@PostProcessor({ name: 'ChainPP1' })
class ChainPP1 implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    Object.defineProperty(instance as object, '__pp1', { value: true, enumerable: true });

    return instance;
  }
}

// Chain PP2 - checks if __pp1 exists (chaining verification)
@PostProcessor({ name: 'ChainPP2' })
class ChainPP2 implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    const sawPp1 = (instance as any).__pp1 === true;

    Object.defineProperty(instance as object, '__pp2', { value: true, enumerable: true });
    Object.defineProperty(instance as object, '__pp2SawPp1', { value: sawPp1, enumerable: true });

    return instance;
  }
}

// OTel-like: Method call tracing PP
@PostProcessor({ name: 'TracingPP' })
class TracingPP implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    const callCounts = new Map<string, number>();

    return new Proxy(instance as object, {
      get(target: any, prop: string | symbol) {
        if (prop === '__callCounts') return callCounts;

        const value = target[prop];

        if (typeof value === 'function') {
          return (...args: any[]) => {
            callCounts.set(String(prop), (callCounts.get(String(prop)) || 0) + 1);

            return value.apply(target, args);
          };
        }

        return value;
      },
    }) as T;
  }
}

// OpenAPI-like: Selective metadata collector
const apiRegistry = new Map<string, string[]>();

@PostProcessor({ name: 'OpenApiPP' })
class OpenApiPP implements ComponentPostProcessor {
  public postProcess<T>(instance: T, Class: any): T {
    // Only collect classes marked as CONTROLLER
    if (getTypedMetadata(ComponentType.CONTROLLER, Class)) {
      const methods = Object.getOwnPropertyNames(Class.prototype).filter(
        (m) => m !== 'constructor' && typeof Class.prototype[m] === 'function',
      );

      apiRegistry.set(Class.name, methods);
    }

    return instance; // Mode 2: unchanged
  }
}

// Test controller for OpenAPI scenario
@Controller('/api/users')
class TestController {
  public getUsers(): string {
    return 'users';
  }

  public createUser(): string {
    return 'created';
  }
}
