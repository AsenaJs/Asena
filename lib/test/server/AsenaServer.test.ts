import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServer } from '../../server';
import { Controller, ServerService, WebSocket } from '../../server/decorators';
import { ComponentType, Scope } from '../../ioc/types';
import { Inject } from '../../ioc/component/decorators';
import { AsenaService } from '../../services';
import { Get } from '../../server/web/api';
import type { Context } from '../../adapter/defaultAdapter';
import { AsenaWebSocketService, type Socket } from '../../server/web/websocket';

@ServerService({
  name: 'TestService',
  scope: Scope.SINGLETON,
})
class TestServerService extends AsenaService {

  public testValue = 'Test Value';

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

    expect(mockAdapter.setPort).toHaveBeenCalledWith(port);
  });

  test('should register components', async () => {
    const components = [TestServerService, TestController, TestWebSocket];

    server.components(components);
    await server.start();

    // @ts-ignore - private property access for testing
    const ioc = server._ioc;

    expect(ioc.container.getAll(ComponentType.SERVER_SERVICE)).toHaveLength(1);

    expect(ioc.container.getAll(ComponentType.CONTROLLER)).toHaveLength(1);

    expect(ioc.container.getAll(ComponentType.WEBSOCKET)).toHaveLength(1);

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should register controllers', async () => {
    const components = [TestServerService, TestController];

    server.components(components);
    await server.start();

    expect(mockAdapter.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'test/',
        method: 'get',
        staticServe: false,
      }),
    );

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should handle server services', async () => {
    const mockIoc = {
      container: {
        getAll: mock((type: ComponentType) => {
          if (type === ComponentType.SERVER_SERVICE) {
            return [new TestServerService()];
          }

          return [];
        }),
      },
      searchAndRegister: mock(async () => {}),
    };

    // @ts-ignore - private property access for testing
    server._ioc = mockIoc;

    await server.start();

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Service:'));
  });

  test('should handle websocket registration', async () => {
    const mockIoc = {
      container: {
        getAll: mock((type: ComponentType) => {
          if (type === ComponentType.WEBSOCKET) {
            return [new TestWebSocket()];
          }

          return [];
        }),
      },
      searchAndRegister: mock(async () => {}),
    };

    // @ts-ignore - private property access for testing
    server._ioc = mockIoc;

    await server.start();

    expect(mockAdapter.websocketAdapter.registerWebSocket).toHaveBeenCalled();
  });

  test('should handle errors during initialization', async () => {
    const mockIoc = {
      container: {
        getAll: mock(() => {
          throw new Error('Test error');
        }),
      },
      searchAndRegister: mock(async () => {}),
    };

    // @ts-ignore - private property access for testing
    server._ioc = mockIoc;

    expect(server.start()).rejects.toThrow('Test error');
  });
});
