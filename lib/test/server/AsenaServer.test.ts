import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServer } from '../../server';
import { Controller, ServerService, WebSocket } from '../../server/decorators';
import { ComponentType, Scope } from '../../ioc/types';
import { Inject } from '../../ioc/component';
import type { WSOptions } from '../../server/web/websocket';
import { AsenaWebSocketService, type Socket } from '../../server/web/websocket';
import { Get } from '../../server/web/decorators';
import type { Context } from '../../adapter/hono';
import { PostConstruct } from '../../ioc/component/decorators/PostConstruct';

@ServerService({
  name: 'TestService',
  scope: Scope.SINGLETON,
})
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
  public async get(context: Context) {
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

describe('AsenaServer', () => {
  let server: AsenaServer;
  let mockLogger: any;
  let mockAdapter: any;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: mock(() => {}),
      error: mock(() => {}),
    };

    // Mock adapter
    mockAdapter = {
      setPort: mock(() => {}),
      start: mock(async () => {}),
      registerRoute: mock(() => {}),
      prepareMiddlewares: mock(() => []),
      prepareHandler: mock(() => () => {}),
      prepareValidator: mock(() => {}),
      use: mock(() => {}),
      websocketAdapter: {
        registerWebSocket: mock(() => {}),
        prepareWebSocket: mock(() => {}),
      },
    };

    server = new AsenaServer(mockAdapter);
    server.logger(mockLogger);
  });

  test('should initialize server with default configuration', () => {
    expect(server).toBeDefined();
  });

  test('should set port correctly', () => {
    const port = 3000;

    server.port(port);

    server.components([TestServerService, TestController, TestWebSocket]);

    server.start();
    expect(mockAdapter.setPort).toHaveBeenCalledWith(port);
  });

  test('should register wsOptions correctly', async () => {
    const options: WSOptions = {
      perMessageDeflate: undefined,
      maxPayloadLimit: 1000,
    };

    const components = [TestServerService, TestController, TestWebSocket];

    server.components(components);
    server.wsOptions(options);
    await server.start();

    expect(mockAdapter.websocketAdapter.prepareWebSocket).toHaveBeenCalledWith(options);
  });

  test('should register components', async () => {
    const components = [TestServerService, TestController, TestWebSocket];

    server.components(components);
    await server.start();

    // @ts-ignore - private property access for testing
    const ioc = server._ioc;

    expect(await ioc.container.resolveAll(ComponentType.SERVER_SERVICE)).toHaveLength(1);

    expect(await ioc.container.resolveAll(ComponentType.CONTROLLER)).toHaveLength(1);

    expect(await ioc.container.resolveAll(ComponentType.WEBSOCKET)).toHaveLength(1);

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should register controllers', async () => {
    const components = [TestServerService, TestController];

    server.components(components);
    await server.start();

    expect(mockAdapter.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/',
        method: 'get',
        staticServe: false,
      }),
    );

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should register websockets', async () => {
    const components = [TestServerService, TestWebSocket];

    server.components(components);
    await server.start();

    expect(mockAdapter.websocketAdapter.registerWebSocket).toHaveBeenCalledWith(expect.any(TestWebSocket), []);
  });

  test('should handle websocket registration', async () => {
    // @ts-ignore - private property access for testing
    server._ioc = {
      container: {
        // @ts-ignore
        resolveAll: mock((type: ComponentType) => {
          if (type === ComponentType.WEBSOCKET) {
            return [new TestWebSocket()];
          }

          return [];
        }),
      },
      searchAndRegister: mock(async () => {}),
    };

    await server.start();

    expect(mockAdapter.websocketAdapter.registerWebSocket).toHaveBeenCalled();
  });

  test('should handle errors during initialization', async () => {
    // @ts-ignore - private property access for testing
    server._ioc = {
      // @ts-ignore
      container: {
        resolveAll: mock(() => {
          throw new Error('Test error');
        }),
      },
      searchAndRegister: mock(async () => {}),
    };

    expect(server.start()).rejects.toThrow('Test error');
  });
});
