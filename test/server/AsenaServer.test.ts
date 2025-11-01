import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AsenaServer } from '../../lib/server';
import { AsenaServerFactory } from '../../lib/server';
import { Config, Controller, EventService, Service, WebSocket } from '../../lib/server/decorators';
import { ComponentType } from '../../lib/ioc';
import { Inject, PostConstruct } from '../../lib/ioc/component';
import { AsenaWebSocketService, type Socket } from '../../lib/server/web/websocket';
import { Get } from '../../lib/server/web/decorators';
import type { AsenaContext, AsenaServeOptions, WebsocketRouteParams } from '../../lib/adapter';
import type { AsenaConfig } from '../../lib/server/config';
import { emitter, On } from '../../lib/server/event';
import type { EventEmitter } from '../../lib/server/event';

@Service()
class TestServerService {
  public testValue = 'Test Value';

  @PostConstruct()
  protected async onStart() {
    return Promise.resolve();
  }
}

@Controller('/test')
class TestController {
  @Inject(TestServerService)
  private testServerService: TestServerService;

  @Get('/')
  public async get(context: AsenaContext<any, any>) {
    console.log('TestController -> get -> context', context);

    console.log('TestController -> get -> this.testServerService.testValue', this.testServerService.testValue);

    return context.send('Hello World');
  }
}

@WebSocket('/ws')
class TestWebSocket extends AsenaWebSocketService<any> {
  public onOpen(ws: Socket) {
    console.log('TestWebSocket -> onOpen -> ws', ws);
  }
}

const options: AsenaServeOptions = {
  wsOptions: {
    perMessageDeflate: true,
    maxPayloadLimit: 1000,
  },
};

@Config('TestConfig')
class TestConfig implements AsenaConfig {
  public serveOptions(): AsenaServeOptions {
    return options;
  }
}

describe('AsenaServer', () => {
  let server: AsenaServer<any>;
  let mockLogger: any;
  let mockAdapter: any;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    };

    // Mock adapter
    mockAdapter = {
      name: 'MockAdapter',
      options: {},
      setPort: mock(() => {}),
      start: mock(async () => {}),
      registerRoute: mock(() => {}),
      registerWebsocketRoute: mock(() => {}),
      prepareMiddlewares: mock(() => []),
      prepareHandler: mock(() => () => {}),
      prepareValidator: mock(() => {}),
      use: mock(() => {}),
      serveOptions: mock(async (options: () => Promise<any>) => {
        mockAdapter.options = await options();
      }),
      websocketAdapter: {
        registerWebSocket: mock(() => {}),
        startWebsocket: mock(() => {}),
      },
    };
  });

  afterEach(() => {
    mock().mockClear();
  });

  test('should initialize server with factory', async () => {
    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [],
    });

    expect(server).toBeDefined();
    expect(server.coreContainer).toBeDefined();
  });

  test('should set port correctly', async () => {
    const port = 3000;

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port,
      components: [TestServerService, TestController, TestWebSocket],
    });

    await server.start();
    expect(mockAdapter.setPort).toHaveBeenCalledWith(port);
  });

  test('should register wsOptions correctly', async () => {
    const components = [TestServerService, TestController, TestWebSocket, TestConfig];

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components,
    });

    await server.start();

    const instance: TestConfig | TestConfig[] = await server.coreContainer.container.resolve<TestConfig>('TestConfig');

    expect(instance).toBeDefined();
    expect(mockAdapter.options).toBe(options);
  });

  test('should register components', async () => {
    const components = [TestServerService, TestController, TestWebSocket];

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components,
    });

    await server.start();

    const container = server.coreContainer.container;

    const services = await container.resolveAll<TestServerService>(ComponentType.SERVICE);

    expect(services).toHaveLength(1);
    expect((services[0] as TestServerService).testValue).toBe('Test Value');
    expect(await container.resolveAll(ComponentType.CONTROLLER)).toHaveLength(1);
    expect(await container.resolveAll(ComponentType.WEBSOCKET)).toHaveLength(1);

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should register controllers', async () => {
    const components = [TestServerService, TestController];

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components,
    });

    await server.start();

    expect(mockAdapter.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/',
        method: 'get',
        staticServe: undefined,
      }),
    );

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should register websockets', async () => {
    const components = [TestServerService, TestWebSocket];

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components,
    });

    await server.start();

    const webSocketService: TestWebSocket[] | TestWebSocket =
      await server.coreContainer.container.resolve('TestWebSocket');

    const params: WebsocketRouteParams<any> = {
      controllerName: 'TestWebSocket',
      path: 'ws',
      middlewares: [],
      websocketService: webSocketService as TestWebSocket,
    };

    expect(mockAdapter.registerWebsocketRoute).toHaveBeenCalledWith(params);
  });

  test('should handle websocket registration', async () => {
    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestWebSocket],
    });

    await server.start();

    expect(mockAdapter.registerWebsocketRoute).toHaveBeenCalled();
  });

  test('should handle errors during component resolution', async () => {
    // Create a service that will throw during resolution
    @Service()
    class FailingService {
      public constructor() {
        throw new Error('Test Error');
      }
    }

    expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [FailingService],
      }),
    ).rejects.toThrow('Test Error');
  });

  test('should call prepareEventService.prepare() during start', async () => {
    let eventHandlerCalled = false;

    @EventService({ prefix: 'test' })
    class TestEventService {
      @On('event')
      handleTestEvent() {
        eventHandlerCalled = true;
      }
    }

    @Service()
    class TestEmitterService {
      @Inject(emitter())
      private eventEmitter!: EventEmitter;

      public emitTestEvent() {
        this.eventEmitter.emit('test.event');
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestEventService, TestEmitterService],
    });

    await server.start();

    // Verify event system is registered
    const emitterService: TestEmitterService = <TestEmitterService>(
      await server.coreContainer.container.resolve<TestEmitterService>('TestEmitterService')
    );
    expect(emitterService).toBeDefined();

    // Emit event
    emitterService.emitTestEvent();

    // Verify handler was called (meaning prepareEventService.prepare() ran)
    expect(eventHandlerCalled).toBe(true);
  });

  test('should correctly join route paths with forward slashes (Windows compatibility)', async () => {
    @Controller('/api/v1')
    class PathTestController {
      @Get('/users')
      public async getUsers(context: AsenaContext<any, any>) {
        return context.send('users');
      }

      @Get('/posts/detail')
      public async getPosts(context: AsenaContext<any, any>) {
        return context.send('posts');
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [PathTestController],
    });

    await server.start();

    // Verify that paths are joined correctly with forward slashes only
    expect(mockAdapter.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/users',
        method: 'get',
      }),
    );

    expect(mockAdapter.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/posts/detail',
        method: 'get',
      }),
    );

    // Ensure no backslashes exist in registered paths (Windows compatibility)
    const calls = mockAdapter.registerRoute.mock.calls;
    for (const call of calls) {
      const registeredPath = call[0].path;
      expect(registeredPath).not.toContain('\\');
      expect(registeredPath).toMatch(/^\/[a-z0-9\-_/]*$/i);
    }
  });

  test('should handle edge cases in route path joining', async () => {
    @Controller('/api/')
    class EdgeCaseController {
      @Get('/test')
      public async test1(context: AsenaContext<any, any>) {
        return context.send('test1');
      }

      @Get('test2')
      public async test2(context: AsenaContext<any, any>) {
        return context.send('test2');
      }

      @Get('/')
      public async root(context: AsenaContext<any, any>) {
        return context.send('root');
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [EdgeCaseController],
    });

    await server.start();

    const calls = mockAdapter.registerRoute.mock.calls;

    // Check for proper path normalization
    for (const call of calls) {
      const registeredPath = call[0].path;

      // No backslashes
      expect(registeredPath).not.toContain('\\');

      // No double slashes (except in protocol which we don't have)
      expect(registeredPath).not.toMatch(/\/\//);

      // Should start with /
      expect(registeredPath).toMatch(/^\//);
    }
  });
});
