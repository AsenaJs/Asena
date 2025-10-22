import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServer, AsenaServerFactory, ICoreServiceNames } from '../../lib/server';
import { Controller, Get, Inject, Service } from '../../lib/server/decorators';
import type { AsenaContext } from '../../lib/adapter';
import { CoreBootstrapPhase, CoreContainer } from '../../lib/ioc';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for AsenaServerFactory
 * Tests factory pattern implementation and dependency injection
 */
describe('AsenaServerFactory Integration', () => {
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
  });

  test('should create server with all dependencies injected', async () => {
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

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.serviceName).toBe('AsenaServer');

    // Verify core dependencies are injected
    expect(server['_adapter']).toBe(mockAdapter);
    expect(server['_logger']).toBe(mockLogger);
    expect(server['prepareMiddleware']).toBeDefined();
    expect(server['prepareConfigService']).toBeDefined();
    expect(server['prepareWebsocketService']).toBeDefined();
    expect(server['prepareValidatorService']).toBeDefined();
    expect(server['prepareStaticServeConfigService']).toBeDefined();

    // Verify CoreContainer is injected
    expect(server.coreContainer).toBeInstanceOf(CoreContainer);
  });

  test('should handle server creation with minimal options', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
    });

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.serviceName).toBe('AsenaServer');
    expect(server.coreContainer).toBeInstanceOf(CoreContainer);
  });

  test('should configure server port correctly', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 8080,
    });

    expect(server['_port']).toBe(8080);
  });

  test('should configure garbage collection correctly', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      gc: true,
    });

    expect(server['_gc']).toBe(true);
  });

  // TODO: we need to improve mock adapter maybe we need to use bun default
  test('should register user components correctly', async () => {
    @Service()
    class UserService {
      public getUsers() {
        return [{ id: 1, name: 'User 1' }];
      }
    }

    @Service()
    class PostService {
      public getPosts() {
        return [{ id: 1, title: 'Post 1' }];
      }
    }

    @Controller('/api')
    class ApiController {
      @Inject(UserService)
      public userService: UserService;

      @Inject(PostService)
      public postService: PostService;

      @Get({ path: '/users' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send(this.userService.getUsers());
      }

      @Get({ path: '/posts' })
      public getPosts(context: AsenaContext<any, any>) {
        return context.send(this.postService.getPosts());
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [UserService, PostService, ApiController],
    });

    await server.start();

    // Verify components are registered and working
    const usersResponse = await mockAdapter.testRequest('GET', '/api/users');

    expect(usersResponse.status).toBe(200);
    expect(usersResponse.body).toHaveLength(1);

    const postsResponse = await mockAdapter.testRequest('GET', '/api/posts');

    expect(postsResponse.status).toBe(200);
    expect(postsResponse.body).toHaveLength(1);
  });

  test('should handle empty components array', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [],
    });

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);
  });

  test('should handle server without components', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);
  });

  test('should bootstrap core services in correct order', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    const coreContainer = server.coreContainer;

    // Verify all core services are registered
    expect(await coreContainer.resolve(ICoreServiceNames.CONTAINER)).toBeDefined();
    expect(await coreContainer.resolve(ICoreServiceNames.SERVER_LOGGER)).toBe(mockLogger);
    expect(await coreContainer.resolve(ICoreServiceNames.IOC_ENGINE)).toBeDefined();
    expect(await coreContainer.resolve(ICoreServiceNames.ASENA_ADAPTER)).toBe(mockAdapter);
    expect(await coreContainer.resolve(ICoreServiceNames.PREPARE_MIDDLEWARE_SERVICE)).toBeDefined();
    expect(await coreContainer.resolve(ICoreServiceNames.PREPARE_CONFIG_SERVICE)).toBeDefined();
    expect(await coreContainer.resolve(ICoreServiceNames.PREPARE_WEBSOCKET_SERVICE)).toBeDefined();
    expect(await coreContainer.resolve(ICoreServiceNames.PREPARE_VALIDATOR_SERVICE)).toBeDefined();
    expect(await coreContainer.resolve(ICoreServiceNames.PREPARE_STATIC_SERVE_CONFIG_SERVICE)).toBeDefined();
  });

  test('should handle server lifecycle correctly', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    // Verify initial state
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.USER_COMPONENTS_INIT);

    // Start server
    await server.start();

    // Verify server is ready
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
  });

  test('should handle multiple server instances', async () => {
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

    expect(server1).toBeInstanceOf(AsenaServer);
    expect(server2).toBeInstanceOf(AsenaServer);
    expect(server1).not.toBe(server2);
    expect(server1.coreContainer).not.toBe(server2.coreContainer);
  });

  test('should handle factory with config file', async () => {
    // This test assumes there might be a config file
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer).toBeInstanceOf(CoreContainer);
  });

  test('should verify all core services are singletons', async () => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    const coreContainer = server.coreContainer;

    // Resolve services multiple times
    const prepareMiddleware1 = await coreContainer.resolve('PrepareMiddlewareService');
    const prepareMiddleware2 = await coreContainer.resolve('PrepareMiddlewareService');

    const prepareConfig1 = await coreContainer.resolve('PrepareConfigService');
    const prepareConfig2 = await coreContainer.resolve('PrepareConfigService');

    // Verify they are the same instance (singleton)
    expect(prepareMiddleware1).toBe(prepareMiddleware2);
    expect(prepareConfig1).toBe(prepareConfig2);
  });
});
