import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { AsenaServer } from '../../server';
import { Config, Controller, Service, WebSocket } from '../../server/decorators';
import { ComponentType } from '../../ioc/types';
import { Inject, PostConstruct } from '../../ioc/component';
import { AsenaWebSocketService, type Socket } from '../../server/web/websocket';
import { Get } from '../../server/web/decorators';
import type { AsenaContext, AsenaServeOptions, WebsocketRouteParams } from '../../adapter';
import type { AsenaConfig } from '../../server/config';

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

    server = new AsenaServer(mockAdapter, console);
    server.logger(mockLogger);
  });

  afterEach(() => {
    mock().mockClear();
  });

  test('should initialize server with default configuration', () => {
    expect(server).toBeDefined();
  });

  test('should set port correctly', async () => {
    const port = 3000;

    server.port(port);

    server.components([TestServerService, TestController, TestWebSocket]);

    await server.start();
    expect(mockAdapter.setPort).toHaveBeenCalledWith(port);
  });

  test('should register wsOptions correctly', async () => {
    const components = [TestServerService, TestController, TestWebSocket, TestConfig];

    server.components(components);
    await server.start();

    // @ts-ignore
    const instace: TestConfig = await server._ioc.container.resolve<TestConfig>('TestConfig');

    expect(instace).toBeDefined();

    expect(mockAdapter.options).toBe(options);
  });

  test('should register components', async () => {
    const components = [TestServerService, TestController, TestWebSocket];

    server.components(components);
    await server.start();

    // @ts-ignore - private property access for testing
    const ioc = server._ioc;

    const services = await ioc.container.resolveAll<TestServerService>(ComponentType.SERVICE);

    expect(services).toHaveLength(1);

    expect((services[0] as TestServerService).testValue).toBe('Test Value');

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
        staticServe: undefined,
      }),
    );

    expect(mockLogger.info).toHaveBeenCalled();
    expect(mockAdapter.start).toHaveBeenCalled();
  });

  test('should register websockets', async () => {
    const components = [TestServerService, TestWebSocket];

    server.components(components);
    await server.start();

    // @ts-ignore - private property access for testing
    const ioc = server._ioc;

    const webSocketService: TestWebSocket[] | TestWebSocket = await ioc.container.resolve('TestWebSocket');

    const params: WebsocketRouteParams<any> = {
      path: 'ws',
      middlewares: [],
      websocketService: webSocketService as TestWebSocket,
    };

    expect(mockAdapter.registerWebsocketRoute).toHaveBeenCalledWith(params);
  });

  test('should handle websocket registration', async () => {
    const websocketService = new TestWebSocket();

    mockPrepareServices(server);

    // @ts-ignore
    spyOn(server, 'prepareWebsocketService').mockImplementation(() => {
      return {
        prepare: mock().mockReturnValue(Array.of(websocketService)),
      };
    });

    // Mock initialize method
    // @ts-ignore - private property access for testing
    server.initialize = mock(async () => {
      // @ts-ignore
      server._ioc = {
        container: {
          // @ts-ignore
          resolveAll: mock((type: ComponentType) => {
            if (type === ComponentType.WEBSOCKET) {
              return [websocketService];
            }

            return [];
          }),
        },
        searchAndRegister: mock(async () => {}),
      };
    });

    await server.start();

    expect(mockAdapter.registerWebsocketRoute).toHaveBeenCalled();
  });

  test('should handle errors during initialization', async () => {
    mockPrepareServices(server);

    // @ts-ignore
    server.initialize = mock(async () => {
      // @ts-ignore
      server._ioc = {
        // @ts-ignore

        container: {
          // @ts-ignore
          resolveAll: mock(() => {
            throw new Error('Test Error');
          }),
        },
        searchAndRegister: mock(async () => {}),
      };
    });

    expect(server.start()).rejects.toThrow('Test Error');
  });
});

const mockPrepareServices = (server) => {
  // @ts-ignore
  spyOn(server, 'prepareConfigService').mockImplementation(() => {
    return {
      prepare: mock(),
    };
  });

  // @ts-ignore
  spyOn(server, 'prepareMiddleware').mockImplementation(() => {
    return {
      prepare: mock(),
    };
  });
};
