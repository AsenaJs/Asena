import { beforeEach, describe, expect, test } from 'bun:test';
import { Container, CoreBootstrapPhase, CoreContainer, ICoreServiceNames, IocEngine } from '../../lib/ioc';
import type { ServerLogger } from '../../lib/logger';

// Mock Logger
class MockLogger implements ServerLogger {
  public logs: string[] = [];

  public log(message: string): void {
    this.logs.push(message);
  }

  public info(message: string): void {
    this.logs.push(`INFO: ${message}`);
  }

  public warn(message: string): void {
    this.logs.push(`WARN: ${message}`);
  }

  public error(message: string): void {
    this.logs.push(`ERROR: ${message}`);
  }

  public debug(message: string): void {
    this.logs.push(`DEBUG: ${message}`);
  }

  public profile(message: string): void {
    this.logs.push(`PROFILE: ${message}`);
  }
}

// Mock Adapter
class MockAdapter {
  public name = 'MockAdapter';

  public port = 3000;

  public setPort(port: number): void {
    this.port = port;
  }

  public async start(): Promise<any> {
    // Mock start - returns mock server
    return {} as any;
  }
}

describe('CoreContainer', () => {
  let coreContainer: CoreContainer;
  let mockLogger: MockLogger;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    coreContainer = new CoreContainer();
    mockLogger = new MockLogger();
    mockAdapter = new MockAdapter();
  });

  describe('Construction and Initialization', () => {
    test('should create CoreContainer with initial state', () => {
      expect(coreContainer).toBeInstanceOf(CoreContainer);
      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.CONTAINER_INIT);
      expect(coreContainer.isInitialized).toBe(false);
      expect(coreContainer.container).toBeInstanceOf(Container);
    });

    test('should have accessible container getter', () => {
      const container = coreContainer.container;

      expect(container).toBeInstanceOf(Container);
      expect(container).toBeDefined();
    });

    test('should start with CONTAINER_INIT phase', () => {
      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.CONTAINER_INIT);
    });
  });

  describe('Bootstrap Process', () => {
    test('should bootstrap successfully in correct order', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      expect(coreContainer.isInitialized).toBe(true);
      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_SCAN);
    });

    test('should throw error on double initialization', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      expect(coreContainer.bootstrap(mockAdapter as any, mockLogger)).rejects.toThrow(
        'CoreContainer already initialized',
      );
    });

    test('should register Container in phase 1', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const container = await coreContainer.resolve<Container>(ICoreServiceNames.CONTAINER);

      expect(container).toBe(coreContainer.container);
    });

    test('should register Logger in phase 2', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const logger = await coreContainer.resolve<ServerLogger>(ICoreServiceNames.SERVER_LOGGER);

      expect(logger).toBe(mockLogger);
    });

    test('should register IocEngine in phase 3', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const iocEngine = await coreContainer.resolve<IocEngine>(ICoreServiceNames.IOC_ENGINE);

      expect(iocEngine).toBeInstanceOf(IocEngine);
    });

    test('should register Adapter in phase 4', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const adapter = await coreContainer.resolve(ICoreServiceNames.ASENA_ADAPTER);

      expect(adapter).toBe(mockAdapter);
    });

    test('should progress through phases sequentially', async () => {
      const phases: CoreBootstrapPhase[] = [];

      // Capture initial phase
      phases.push(coreContainer.currentPhase);

      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      // Final phase
      phases.push(coreContainer.currentPhase);

      expect(phases[0]).toBe(CoreBootstrapPhase.CONTAINER_INIT);
      expect(phases[phases.length - 1]).toBe(CoreBootstrapPhase.USER_COMPONENTS_SCAN);
    });
  });

  describe('Phase Management', () => {
    test('should allow manual phase updates', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      coreContainer.setPhase(CoreBootstrapPhase.APPLICATION_SETUP);

      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.APPLICATION_SETUP);

      coreContainer.setPhase(CoreBootstrapPhase.SERVER_READY);

      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
    });

    test('should track phase transitions during bootstrap', async () => {
      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.CONTAINER_INIT);

      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_SCAN);
    });
  });

  describe('Service Resolution', () => {
    test('should resolve all registered core services', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const container = await coreContainer.resolve<Container>(ICoreServiceNames.CONTAINER);
      const logger = await coreContainer.resolve<ServerLogger>(ICoreServiceNames.SERVER_LOGGER);
      const iocEngine = await coreContainer.resolve<IocEngine>(ICoreServiceNames.IOC_ENGINE);
      const adapter = await coreContainer.resolve(ICoreServiceNames.ASENA_ADAPTER);

      expect(container).toBeDefined();
      expect(logger).toBeDefined();
      expect(iocEngine).toBeDefined();
      expect(adapter).toBeDefined();
    });

    test('should throw error when resolving unregistered service', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      expect(coreContainer.resolve('NonExistentService')).rejects.toThrow('NonExistentService is not registered');
    });

    test('resolved services should be singletons', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const logger1 = await coreContainer.resolve<ServerLogger>('ServerLogger');
      const logger2 = await coreContainer.resolve<ServerLogger>('ServerLogger');

      expect(logger1).toBe(logger2);

      const iocEngine1 = await coreContainer.resolve<IocEngine>('IocEngine');
      const iocEngine2 = await coreContainer.resolve<IocEngine>('IocEngine');

      expect(iocEngine1).toBe(iocEngine2);
    });
  });

  describe('Container Integration', () => {
    test('should have same container instance throughout lifecycle', async () => {
      const containerBefore = coreContainer.container;

      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const containerAfter = coreContainer.container;
      const containerResolved = await coreContainer.resolve<Container>('Container');

      expect(containerBefore).toBe(containerAfter);
      expect(containerBefore).toBe(containerResolved);
    });

    test('should allow direct container access for advanced usage', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      // Direct container manipulation
      class CustomService {
        public value = 42;
      }

      await coreContainer.container.registerInstance('CustomService', new CustomService());

      const service = await coreContainer.resolve<CustomService>('CustomService');

      expect(service.value).toBe(42);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing adapter gracefully', async () => {
      expect(coreContainer.bootstrap(null as any, mockLogger)).rejects.toThrow();
    });

    test('should handle missing logger gracefully', async () => {
      expect(coreContainer.bootstrap(mockAdapter as any, null as any)).rejects.toThrow();
    });
  });

  describe('IocEngine Integration', () => {
    // TODO: These tests have minor issues with IocEngine.container injection
    // They will be fully resolved in Phase 7 (AsenaServer Factory Pattern)
    test('IocEngine should be registered and resolvable', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const iocEngine = await coreContainer.resolve<IocEngine>(ICoreServiceNames.IOC_ENGINE);

      expect(iocEngine).toBeInstanceOf(IocEngine);
      expect(iocEngine.container).toBeInstanceOf(Container);
    });

    test('IocEngine should inject CoreContainer Container', async () => {
      await coreContainer.bootstrap(mockAdapter as any, mockLogger);

      const iocEngine = await coreContainer.resolve<IocEngine>(ICoreServiceNames.IOC_ENGINE);

      // After Phase 7 migration, this should pass
      expect(iocEngine.container).toBe(coreContainer.container);
    });
  });
});
