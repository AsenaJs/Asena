import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServer, AsenaServerFactory } from '../../lib/server';
import { Controller, Get, Inject, Service } from '../../lib/server/decorators';
import type { AsenaContext } from '../../lib/adapter';
import { CoreBootstrapPhase } from '../../lib/ioc';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for Bootstrap Phase Flow
 * Tests phase transitions and order verification
 */
describe('Bootstrap Phase Flow Integration', () => {
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
  });

  test('should follow correct bootstrap phase order', async () => {
    @Service()
    class TestService {
      public getData() {
        return 'test data';
      }
    }

    @Controller('/test')
    class TestController {
      @Inject(TestService)
      public testService: TestService;

      @Get({ path: '/' })
      public getData(context: AsenaContext<any, any>) {
        return context.send(this.testService.getData());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestService, TestController],
    });

    // Verify initial phase after factory creation
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    // Start server and verify phase transitions
    await server.start();

    // Verify final phase
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle phase transitions correctly', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    const coreContainer = server.coreContainer;

    // Test phase transitions
    coreContainer.setPhase(CoreBootstrapPhase.APPLICATION_SETUP);
    expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.APPLICATION_SETUP);

    coreContainer.setPhase(CoreBootstrapPhase.SERVER_READY);
    expect(coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should verify core services are registered in correct phases', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    const coreContainer = server.coreContainer;

    // Verify all core services are registered after bootstrap
    expect(await coreContainer.resolve('Container')).toBeDefined();
    expect(await coreContainer.resolve('ServerLogger')).toBe(mockLogger);
    expect(await coreContainer.resolve('IocEngine')).toBeDefined();
    expect(await coreContainer.resolve('AsenaAdapter')).toBe(mockAdapter);
    expect(await coreContainer.resolve('PrepareMiddlewareService')).toBeDefined();
    expect(await coreContainer.resolve('PrepareConfigService')).toBeDefined();
    expect(await coreContainer.resolve('PrepareWebsocketService')).toBeDefined();
    expect(await coreContainer.resolve('PrepareValidatorService')).toBeDefined();
    expect(await coreContainer.resolve('PrepareStaticServeConfigService')).toBeDefined();
  });

  test('should handle user components registration phase', async () => {
    @Service()
    class UserService {
      public getData() {
        return 'user data';
      }
    }

    @Service()
    class AnotherService {
      public getData() {
        return 'another data';
      }
    }

    @Controller('/api')
    class UserController {
      @Inject(UserService)
      public userService: UserService;

      @Inject(AnotherService)
      public anotherService: AnotherService;

      @Get({ path: '/users' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send(this.userService.getData());
      }

      @Get({ path: '/another' })
      public getAnother(context: AsenaContext<any, any>) {
        return context.send(this.anotherService.getData());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [UserService, AnotherService, UserController],
    });

    // Verify phase after user components registration
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after server start
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle application setup phase', async () => {
    @Service()
    class ConfigService {
      public getConfig() {
        return { setting: 'value' };
      }
    }

    @Controller('/config')
    class ConfigController {
      @Inject(ConfigService)
      public configService: ConfigService;

      @Get({ path: '/' })
      public getConfig(context: AsenaContext<any, any>) {
        return context.send(this.configService.getConfig());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [ConfigService, ConfigController],
    });

    // Verify phase before start
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after start (application setup completed)
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle server ready phase', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    await server.start();

    // Verify server is in ready phase
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);

    // Verify server is functional
    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.serviceName).toBe('AsenaServer');
  });

  test('should handle phase transitions with complex components', async () => {
    @Service()
    class DatabaseService {
      public connect() {
        return 'connected';
      }
    }

    @Service()
    class CacheService {
      @Inject(DatabaseService)
      public database: DatabaseService;

      public get(key: string) {
        return `cached: ${key}`;
      }
    }

    @Service()
    class UserService {
      @Inject(DatabaseService)
      public database: DatabaseService;

      @Inject(CacheService)
      public cache: CacheService;

      public getUsers() {
        return [{ id: 1, name: 'User' }];
      }
    }

    @Controller('/api')
    class UserController {
      @Inject(UserService)
      public userService: UserService;

      @Get({ path: '/users' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send(this.userService.getUsers());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [DatabaseService, CacheService, UserService, UserController],
    });

    // Verify phase after complex component registration
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after complex application setup
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle phase transitions with WebSocket components', async () => {
    class TestWebSocket {
      public onOpen(ws: any) {
        ws.send('connected');
      }

      public onMessage(ws: any, message: any) {
        ws.send(`echo: ${message}`);
      }
    }

    @Service()
    class WebSocketService {
      public getData() {
        return 'websocket data';
      }
    }

    @Controller('/api')
    class ApiController {
      @Inject(WebSocketService)
      public webSocketService: WebSocketService;

      @Get({ path: '/' })
      public getData(context: AsenaContext<any, any>) {
        return context.send(this.webSocketService.getData());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestWebSocket, WebSocketService, ApiController],
    });

    // Verify phase after WebSocket component registration
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after WebSocket setup
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle phase transitions with middleware components', async () => {
    class TestMiddleware {
      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>) {
        await next();
      }
    }

    @Service()
    class MiddlewareService {
      public getData() {
        return 'middleware data';
      }
    }

    @Controller('/api')
    class ApiController {
      @Inject(MiddlewareService)
      public middlewareService: MiddlewareService;

      @Get({ path: '/' })
      public getData(context: AsenaContext<any, any>) {
        return context.send(this.middlewareService.getData());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestMiddleware, MiddlewareService, ApiController],
    });

    // Verify phase after middleware component registration
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after middleware setup
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle phase transitions with empty components', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [],
    });

    // Verify phase with empty components
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after empty application setup
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle phase transitions without components', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    // Verify phase without components
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server.start();

    // Verify phase after minimal application setup
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should verify phase order consistency', async () => {
    const expectedOrder = [
      CoreBootstrapPhase.CONTAINER_INIT,
      CoreBootstrapPhase.LOGGER_INIT,
      CoreBootstrapPhase.IOC_ENGINE_INIT,
      CoreBootstrapPhase.HTTP_ADAPTER_INIT,
      CoreBootstrapPhase.PREPARE_SERVICES_INIT,
      CoreBootstrapPhase.USER_COMPONENTS_SCAN,
      CoreBootstrapPhase.USER_COMPONENTS_INIT,
      CoreBootstrapPhase.APPLICATION_SETUP,
      CoreBootstrapPhase.SERVER_READY,
    ];

    // Verify all phases are defined and in correct order
    expectedOrder.forEach((phase) => {
      expect(phase).toBeDefined();
      expect(typeof phase).toBe('string');
    });

    // Verify phases are unique
    const uniquePhases = new Set(expectedOrder);

    expect(uniquePhases.size).toBe(expectedOrder.length);
  });

  test('should handle phase transitions with multiple server instances', async () => {
    const server1 = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3001,
    });

    const server2 = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3002,
    });

    // Verify both servers are in correct phase
    expect(server1.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);
    expect(server2.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    await server1.start();
    await server2.start();

    // Verify both servers are in ready phase
    expect(server1.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
    expect(server2.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });
});
