import { describe, test, expect, beforeEach } from 'bun:test';
import { AsenaServerFactory } from '../../server/AsenaServerFactory';
import { AsenaServer } from '../../server/AsenaServer';
import { Service, Controller, Get, Inject } from '../../server/decorators';
import type { AsenaContext } from '../../adapter';
import { Container } from '../../ioc';
import { ComponentConstants } from '../../ioc/constants';
import { getTypedMetadata } from '../../utils/typedMetadata';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for Symbol Security
 * Tests Symbol-based metadata keys prevent external manipulation
 */
describe('Symbol Security E2E Integration', () => {
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();
    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
  });

  test('should prevent external manipulation with string keys', async () => {
    @Service('TestService')
    class TestService {
      getData() {
        return 'test data';
      }
    }

    // Try to manipulate with string key
    Reflect.defineMetadata('component:name', 'HackedService', TestService);
    Reflect.defineMetadata('component:scope', 'PROTOTYPE', TestService);

    const container = new Container();
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify metadata wasn't changed by external manipulation
    const name = getTypedMetadata(ComponentConstants.NameKey, TestService);
    const scope = getTypedMetadata(ComponentConstants.ScopeKey, TestService);

    expect(name).toBe('TestService'); // Not 'HackedService'
    expect(scope).toBe('SINGLETON'); // Not 'PROTOTYPE'
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of controller metadata', async () => {
    @Controller('/test')
    class TestController {
      @Get({ path: '/' })
      test(context: AsenaContext) {
        return context.send('ok');
      }
    }

    // Try to manipulate with string keys
    Reflect.defineMetadata('controller:path', '/hacked', TestController);
    Reflect.defineMetadata('controller:route', { hacked: true }, TestController);

    const container = new Container();
    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    // Verify metadata wasn't changed
    const path = getTypedMetadata(ComponentConstants.PathKey, TestController);
    const routes = getTypedMetadata(ComponentConstants.RouteKey, TestController);

    expect(path).toBe('/test'); // Not '/hacked'
    expect(routes).toBeDefined();
    expect(instance).toBeInstanceOf(TestController);
  });

  test('should prevent external manipulation of middleware metadata', async () => {
    class TestMiddleware {
      async handle(context: AsenaContext, next: () => Promise<void>) {
        await next();
      }
    }

    // Try to manipulate with string keys
    Reflect.defineMetadata('middleware:middlewares', ['HackedMiddleware'], TestMiddleware);
    Reflect.defineMetadata('middleware:validator', 'HackedValidator', TestMiddleware);

    const container = new Container();
    await container.register('TestMiddleware', TestMiddleware, true);

    const instance = await container.resolve<TestMiddleware>('TestMiddleware');

    // Verify metadata wasn't changed
    const middlewares = getTypedMetadata(ComponentConstants.MiddlewaresKey, TestMiddleware);
    const validator = getTypedMetadata(ComponentConstants.ValidatorKey, TestMiddleware);

    expect(middlewares).toBeUndefined(); // Not ['HackedMiddleware']
    expect(validator).toBeUndefined(); // Not 'HackedValidator'
    expect(instance).toBeInstanceOf(TestMiddleware);
  });

  test('should prevent external manipulation of route metadata', async () => {
    @Controller('/api')
    class TestController {
      @Get({ path: '/users' })
      getUsers(context: AsenaContext) {
        return context.json({ users: [] });
      }
    }

    // Try to manipulate route metadata with string keys
    Reflect.defineMetadata('route:method', 'POST', TestController);
    Reflect.defineMetadata('route:path', '/hacked', TestController);

    const container = new Container();
    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    // Verify route metadata wasn't changed
    const method = getTypedMetadata(ComponentConstants.MethodKey, TestController);
    const path = getTypedMetadata(ComponentConstants.RoutePathKey, TestController);

    // These should be undefined because they're not set by decorators
    expect(method).toBeUndefined();
    expect(path).toBeUndefined();
    expect(instance).toBeInstanceOf(TestController);
  });

  test('should prevent external manipulation of WebSocket metadata', async () => {
    class TestWebSocket {
      onOpen(ws: any) {
        ws.send('connected');
      }
    }

    // Try to manipulate WebSocket metadata with string keys
    Reflect.defineMetadata('websocket:path', '/hacked', TestWebSocket);
    Reflect.defineMetadata('websocket:middlewares', ['HackedMiddleware'], TestWebSocket);

    const container = new Container();
    await container.register('TestWebSocket', TestWebSocket, true);

    const instance = await container.resolve<TestWebSocket>('TestWebSocket');

    // Verify WebSocket metadata wasn't changed
    const path = getTypedMetadata(ComponentConstants.WebSocketPathKey, TestWebSocket);
    const middlewares = getTypedMetadata(ComponentConstants.WebSocketMiddlewaresKey, TestWebSocket);

    expect(path).toBeUndefined(); // Not '/hacked'
    expect(middlewares).toBeUndefined(); // Not ['HackedMiddleware']
    expect(instance).toBeInstanceOf(TestWebSocket);
  });

  test('should prevent external manipulation of static serve metadata', async () => {
    class TestStaticServe {
      serve() {
        return 'static content';
      }
    }

    // Try to manipulate static serve metadata with string keys
    Reflect.defineMetadata('staticServe:root', '/hacked', TestStaticServe);

    const container = new Container();
    await container.register('TestStaticServe', TestStaticServe, true);

    const instance = await container.resolve<TestStaticServe>('TestStaticServe');

    // Verify static serve metadata wasn't changed
    const root = getTypedMetadata(ComponentConstants.StaticServeRootKey, TestStaticServe);

    expect(root).toBeUndefined(); // Not '/hacked'
    expect(instance).toBeInstanceOf(TestStaticServe);
  });

  test('should prevent external manipulation of dependency metadata', async () => {
    @Service()
    class DependencyService {
      getData() {
        return 'dependency data';
      }
    }

    @Service()
    class TestService {
      @Inject(DependencyService)
      dependency: DependencyService;

      getData() {
        return this.dependency.getData();
      }
    }

    // Try to manipulate dependency metadata with string keys
    Reflect.defineMetadata('component:dependency', ['HackedDependency'], TestService);
    Reflect.defineMetadata('component:softDependency', ['HackedSoftDependency'], TestService);

    const container = new Container();
    await container.register('DependencyService', DependencyService, true);
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify dependency metadata wasn't changed
    const dependencies = getTypedMetadata(ComponentConstants.DependencyKey, TestService);
    const softDependencies = getTypedMetadata(ComponentConstants.SoftDependencyKey, TestService);

    expect(dependencies).toBeUndefined(); // Not ['HackedDependency']
    expect(softDependencies).toBeUndefined(); // Not ['HackedSoftDependency']
    expect(instance).toBeInstanceOf(TestService);
    expect(instance.dependency).toBeInstanceOf(DependencyService);
  });

  test('should prevent external manipulation of strategy metadata', async () => {
    @Service()
    class TestService {
      getData() {
        return 'test data';
      }
    }

    // Try to manipulate strategy metadata with string keys
    Reflect.defineMetadata('component:strategy', 'HackedStrategy', TestService);
    Reflect.defineMetadata('component:expression', 'hacked expression', TestService);

    const container = new Container();
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify strategy metadata wasn't changed
    const strategy = getTypedMetadata(ComponentConstants.StrategyKey, TestService);
    const expression = getTypedMetadata(ComponentConstants.ExpressionKey, TestService);

    expect(strategy).toBeUndefined(); // Not 'HackedStrategy'
    expect(expression).toBeUndefined(); // Not 'hacked expression'
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of post-construct metadata', async () => {
    @Service()
    class TestService {
      onInit() {
        return 'initialized';
      }

      getData() {
        return 'test data';
      }
    }

    // Try to manipulate post-construct metadata with string keys
    Reflect.defineMetadata('component:postConstruct', 'hackedMethod', TestService);

    const container = new Container();
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify post-construct metadata wasn't changed
    const postConstruct = getTypedMetadata(ComponentConstants.PostConstructKey, TestService);

    expect(postConstruct).toBeUndefined(); // Not 'hackedMethod'
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of override metadata', async () => {
    @Service()
    class TestService {
      getData() {
        return 'test data';
      }
    }

    // Try to manipulate override metadata with string keys
    Reflect.defineMetadata('component:override', ['hackedMethod'], TestService);

    const container = new Container();
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify override metadata wasn't changed
    const override = getTypedMetadata(ComponentConstants.OverrideKey, TestService);

    expect(override).toBeUndefined(); // Not ['hackedMethod']
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of interface metadata', async () => {
    interface TestInterface {
      getData(): string;
    }

    @Service()
    class TestService implements TestInterface {
      getData() {
        return 'test data';
      }
    }

    // Try to manipulate interface metadata with string keys
    Reflect.defineMetadata('component:interface', 'HackedInterface', TestService);

    const container = new Container();
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify interface metadata wasn't changed
    const interfaceName = getTypedMetadata(ComponentConstants.InterfaceKey, TestService);

    expect(interfaceName).toBeUndefined(); // Not 'HackedInterface'
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of cron metadata', async () => {
    @Service()
    class TestService {
      getData() {
        return 'test data';
      }
    }

    // Try to manipulate cron metadata with string keys
    Reflect.defineMetadata('component:cron', '0 0 * * *', TestService);

    const container = new Container();
    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify cron metadata wasn't changed
    const cron = getTypedMetadata(ComponentConstants.CronKey, TestService);

    expect(cron).toBeUndefined(); // Not '0 0 * * *'
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of controller config metadata', async () => {
    @Controller('/test')
    class TestController {
      @Get({ path: '/' })
      test(context: AsenaContext) {
        return context.send('ok');
      }
    }

    // Try to manipulate controller config metadata with string keys
    Reflect.defineMetadata('controller:config', { hacked: true }, TestController);

    const container = new Container();
    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    // Verify controller config metadata wasn't changed
    const config = getTypedMetadata(ComponentConstants.ControllerConfigKey, TestController);

    expect(config).toBeUndefined(); // Not { hacked: true }
    expect(instance).toBeInstanceOf(TestController);
  });

  test('should prevent external manipulation of route middlewares metadata', async () => {
    @Controller('/test')
    class TestController {
      @Get({ path: '/' })
      test(context: AsenaContext) {
        return context.send('ok');
      }
    }

    // Try to manipulate route middlewares metadata with string keys
    Reflect.defineMetadata('route:middlewares', ['HackedMiddleware'], TestController);
    Reflect.defineMetadata('route:validator', 'HackedValidator', TestController);

    const container = new Container();
    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    // Verify route middlewares metadata wasn't changed
    const middlewares = getTypedMetadata(ComponentConstants.RouteMiddlewaresKey, TestController);
    const validator = getTypedMetadata(ComponentConstants.RouteValidatorKey, TestController);

    expect(middlewares).toBeUndefined(); // Not ['HackedMiddleware']
    expect(validator).toBeUndefined(); // Not 'HackedValidator'
    expect(instance).toBeInstanceOf(TestController);
  });

  test('should prevent external manipulation in factory pattern', async () => {
    @Service('SecureService')
    class SecureService {
      getData() {
        return 'secure data';
      }
    }

    @Controller('/secure')
    class SecureController {
      @Inject(SecureService)
      secureService: SecureService;

      @Get({ path: '/' })
      getData(context: AsenaContext) {
        return context.json(this.secureService.getData());
      }
    }

    // Try to manipulate metadata before factory creation
    Reflect.defineMetadata('component:name', 'HackedService', SecureService);
    Reflect.defineMetadata('controller:path', '/hacked', SecureController);

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [SecureService, SecureController]
    });

    await server.start();

    // Verify metadata wasn't changed
    const serviceName = getTypedMetadata(ComponentConstants.NameKey, SecureService);
    const controllerPath = getTypedMetadata(ComponentConstants.PathKey, SecureController);

    expect(serviceName).toBe('SecureService'); // Not 'HackedService'
    expect(controllerPath).toBe('/secure'); // Not '/hacked'

    // Test that the service still works correctly
    const response = await mockAdapter.testRequest('GET', '/secure');
    expect(response.status).toBe(200);
    expect(response.body).toBe('secure data');
  });
});
