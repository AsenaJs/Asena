import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServer } from '../../server';
import { Config, Controller, Service, WebSocket } from '../../server/decorators';
import { ComponentType } from '../../ioc/types';
import { Inject, PostConstruct } from '../../ioc/component';
import { AsenaWebSocketService, type Socket } from '../../server/web/websocket';
import { Get } from '../../server/web/decorators';
import type { AsenaContext, AsenaServeOptions } from '../../adapter';
import type { AsenaConfig } from '../../server/config/AsenaConfig';

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
      prepareMiddlewares: mock(() => []),
      prepareHandler: mock(() => () => {}),
      prepareValidator: mock(() => {}),
      use: mock(() => {}),
      serveOptions: mock(async (options: () => Promise<any>) => {
        mockAdapter.options = await options();
      }),
      websocketAdapter: {
        buildWebsocket: mock(() => {}),
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
    // Mock initialize method
    // @ts-ignore - private property access for testing
    server.initialize = mock(async () => {
      // @ts-ignore
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
    });

    await server.start();

    expect(mockAdapter.websocketAdapter.registerWebSocket).toHaveBeenCalled();
  });

  test('should handle errors during initialization', async () => {
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
