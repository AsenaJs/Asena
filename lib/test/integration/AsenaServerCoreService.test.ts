import { describe, test, expect, beforeEach } from 'bun:test';
import { AsenaServer } from '../../server';
import { CoreContainer } from '../../ioc';
import { CoreBootstrapPhase } from '../../ioc';
import { createMockAdapter } from '../utils/createMockContext';
import { Controller, Inject, Service } from '../../server/decorators';

/**
 * @description Integration test for AsenaServer as Core Service
 * Tests AsenaServer resolution and field injection as a core service
 */
describe('AsenaServer Core Service Integration', () => {
  let mockAdapter: any;
  let mockLogger: any;
  let coreContainer: CoreContainer;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;

    // Create CoreContainer
    coreContainer = new CoreContainer();
  });

  test('AsenaServer should work as core service', async () => {
    // Bootstrap core services
    await coreContainer.bootstrap(mockAdapter, mockLogger);

    // Register CoreContainer itself for AsenaServer injection
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);

    // Register AsenaServer as core service
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    // Resolve AsenaServer
    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.serviceName).toBe('AsenaServer');
    expect(server.coreContainer).toBe(coreContainer);
  });

  test('AsenaServer should have all dependencies injected', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // Verify all field injections
    expect(server['_coreContainer']).toBe(coreContainer);
    expect(server['_adapter']).toBe(mockAdapter);
    expect(server['_logger']).toBe(mockLogger);
    expect(server['prepareMiddleware']).toBeDefined();
    expect(server['prepareConfigService']).toBeDefined();
    expect(server['prepareWebsocketService']).toBeDefined();
    expect(server['prepareValidatorService']).toBeDefined();
    expect(server['prepareStaticServeConfigService']).toBeDefined();
  });

  test('AsenaServer should be singleton', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    // Resolve multiple times
    const server1 = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');
    const server2 = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    expect(server1).toBe(server2);
  });

  test('AsenaServer should implement ICoreService', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    expect(server.serviceName).toBe('AsenaServer');
    expect(typeof server.onInit).toBe('function');
  });

  test('AsenaServer onInit should be called after injection', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // onInit should be callable (lifecycle hook)
    expect(() => server.onInit()).not.toThrow();
  });

  test('AsenaServer should work with user components', async () => {
    // Define test components
    @Service('TestService')
    class TestService {

      public getData() {
        return 'test data';
      }
    
}

    @Controller('/')
    class TestController {

      @Inject('TestService')
      public testService: TestService;

      public getData() {
        return this.testService.getData();
      }
    
}

    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);

    // Register user components
    await coreContainer.container.register('TestService', TestService, true);
    await coreContainer.container.register('TestController', TestController, true);

    // Register AsenaServer
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer).toBe(coreContainer);
  });

  test('AsenaServer should handle port configuration', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // Configure port
    server.port(8080);

    expect(server['_port']).toBe(8080);
  });

  test('AsenaServer should handle garbage collection configuration', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // Configure GC
    (server as any)._gc = true;

    expect(server['_gc']).toBe(true);
  });

  test('AsenaServer should access CoreContainer phases', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // Verify phase access
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_SCAN);

    // Change phase
    server.coreContainer.setPhase(CoreBootstrapPhase.APPLICATION_SETUP);
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.APPLICATION_SETUP);
  });

  test('AsenaServer should work with complex dependency chain', async () => {
    @Service('DataBaseService')
    class DatabaseService {

      public connect() {
        return 'connected';
      }
    
}

    class UserService {

      @Inject('DatabaseService')
      public databaseService: DatabaseService;

      public getUsers() {
        return [{ id: 1, name: 'User' }];
      }
    
}

    @Controller('/')
    class UserController {

      @Inject('UserService')
      public userService: UserService;

      public getUsers() {
        return this.userService.getUsers();
      }
    
}

    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);

    // Register services with dependencies
    await coreContainer.container.register('DatabaseService', DatabaseService, true);
    await coreContainer.container.register('UserService', UserService, true);
    await coreContainer.container.register('UserController', UserController, true);

    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer).toBe(coreContainer);
  });

  test('AsenaServer should handle multiple core services', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // Verify all core services are accessible
    const prepareMiddleware = await server.coreContainer.resolve('PrepareMiddlewareService');
    const prepareConfig = await server.coreContainer.resolve('PrepareConfigService');
    const iocEngine = await server.coreContainer.resolve('IocEngine');

    expect(prepareMiddleware).toBeDefined();
    expect(prepareConfig).toBeDefined();
    expect(iocEngine).toBeDefined();
  });

  test('AsenaServer should maintain service references', async () => {
    await coreContainer.bootstrap(mockAdapter, mockLogger);
    await coreContainer.container.registerInstance('CoreContainer', coreContainer);
    await coreContainer.container.register('AsenaServer', AsenaServer, true);

    const server = await coreContainer.resolve<AsenaServer<any>>('AsenaServer');

    // Verify service references are maintained
    expect(server['prepareMiddleware']).toBe(await coreContainer.resolve('PrepareMiddlewareService'));
    expect(server['prepareConfigService']).toBe(await coreContainer.resolve('PrepareConfigService'));
    expect(server['prepareWebsocketService']).toBe(await coreContainer.resolve('PrepareWebsocketService'));
  });
});
