import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Controller, Middleware, Service, WebSocket } from '../../lib/server/decorators';
import { AsenaWebSocketService } from '../../lib/server/web/websocket';
import { Get } from '../../lib/server/web/decorators';
import { Inject, Scope } from '../../lib/ioc/component';
import type { AsenaContext } from '../../lib/adapter';
import { Container } from '../../lib/ioc';
import { ComponentConstants } from '../../lib/ioc/constants';
import { getChainedTypedMetadataList, getTypedMetadata } from '../../lib/utils/typedMetadata';
import { extractControllerRouteInfo, isValidator } from '../../lib/utils/metadataExtractor';
import { createMockAdapter } from '../utils/createMockContext';
import { defineMetadata } from 'reflect-metadata/no-conflict';
import type { AsenaMiddlewareService } from '../../lib/server/web/middleware';

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
      public getData() {
        return 'test data';
      }
    }

    // Try to manipulate with string key
    defineMetadata('component:name', 'HackedService', TestService);
    defineMetadata('component:scope', 'PROTOTYPE', TestService);

    const container = new Container();

    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify metadata wasn't changed by external manipulation
    const name = getTypedMetadata(ComponentConstants.NameKey, TestService);
    const scope = getTypedMetadata(ComponentConstants.ScopeKey, TestService);

    expect(name).toBe('TestService'); // Not 'HackedService'
    expect(scope).toBe(Scope.SINGLETON); // Not Scope.PROTOTYPE
    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of controller metadata', async () => {
    @Controller('/test')
    class TestController {
      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send('ok');
      }
    }

    // Try to manipulate with string keys
    defineMetadata('controller:path', '/hacked', TestController);
    defineMetadata('controller:route', { hacked: true }, TestController);

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
    class TestMiddleware implements AsenaMiddlewareService {
      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>) {
        await next();
      }
    }

    // Try to manipulate with string keys
    defineMetadata('middleware:middlewares', ['HackedMiddleware'], TestMiddleware);
    defineMetadata('middleware:validator', 'HackedValidator', TestMiddleware);

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
      public getUsers(context: AsenaContext<any, any>) {
        return context.send({ users: [] });
      }
    }

    // Try to manipulate route metadata with string keys
    defineMetadata('route:method', 'POST', TestController);
    defineMetadata('route:path', '/hacked', TestController);

    const container = new Container();

    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    // The decorator's own values survive: a string key cannot reach a Symbol-keyed record.
    // Asserting the real keys rather than unused ones is the point - this used to read
    // MethodKey/RoutePathKey, which no decorator ever wrote, so it passed no matter what.
    const path = getTypedMetadata(ComponentConstants.PathKey, TestController);
    const routes = getTypedMetadata<Record<string, any>>(ComponentConstants.RouteKey, TestController);

    expect(path).toBe('/api'); // Not '/hacked'
    expect(routes?.getUsers?.path).toBe('users');
    expect(routes?.getUsers?.method).toBe('get'); // Not 'POST'
    expect(instance).toBeInstanceOf(TestController);
  });

  test('should prevent external manipulation of WebSocket metadata', async () => {
    @WebSocket('/ws/test')
    class TestWebSocket extends AsenaWebSocketService<any> {
      public onOpen(ws: any) {
        ws.send('connected');
      }
    }

    // Try to manipulate WebSocket metadata with string keys
    defineMetadata('component:path', '/hacked', TestWebSocket);
    defineMetadata('middleware:middlewares', ['HackedMiddleware'], TestWebSocket);

    const container = new Container();

    await container.register('TestWebSocket', TestWebSocket, true);

    const instance = await container.resolve<TestWebSocket>('TestWebSocket');

    const path = getTypedMetadata(ComponentConstants.PathKey, TestWebSocket);
    const middlewares = getTypedMetadata(ComponentConstants.MiddlewaresKey, TestWebSocket);

    expect(path).toBe('ws/test'); // @WebSocket strips the leading slash. Not '/hacked'.
    expect(middlewares).toEqual([]); // Not ['HackedMiddleware']
    expect(instance).toBeInstanceOf(TestWebSocket);
  });

  test('should prevent external manipulation of static serve metadata', async () => {
    class TestStaticServe {
      public serve() {
        return 'static content';
      }
    }

    // Try to manipulate static serve metadata with string keys
    defineMetadata('staticServe:root', '/hacked', TestStaticServe);

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
      public getData() {
        return 'dependency data';
      }
    }

    @Service()
    class TestService {
      @Inject(DependencyService)
      public dependency: DependencyService;

      public getData() {
        return this.dependency.getData();
      }
    }

    // Try to manipulate dependency metadata with string keys
    defineMetadata('component:dependency', ['HackedDependency'], TestService);
    defineMetadata('component:softDependency', ['HackedSoftDependency'], TestService);

    const container = new Container();

    await container.register('DependencyService', DependencyService, true);
    await container.register('TestService', TestService, true);

    // @ts-ignore
    const instance: TestService = await container.resolve<TestService>('TestService');

    // Verify dependency metadata wasn't changed by external string-key manipulation
    const dependencies: any = getTypedMetadata(ComponentConstants.DependencyKey, TestService);
    const softDependencies = getTypedMetadata(ComponentConstants.SoftDependencyKey, TestService);

    // Dependencies should exist from @Inject decorator (Symbol-based)
    expect(dependencies).toBeDefined();
    expect(dependencies.dependency).toBe('DependencyService'); // Not ['HackedDependency']
    expect(softDependencies).toBeUndefined(); // Not ['HackedSoftDependency']
    expect(instance).toBeInstanceOf(TestService);
    expect(instance.dependency).toBeInstanceOf(DependencyService);
  });

  test('should prevent external manipulation of strategy metadata', async () => {
    @Service()
    class TestService {
      public getData() {
        return 'test data';
      }
    }

    // Try to manipulate strategy metadata with string keys
    defineMetadata('component:strategy', 'HackedStrategy', TestService);
    defineMetadata('component:expression', 'hacked expression', TestService);

    const container = new Container();

    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify strategy metadata wasn't changed by external string-key manipulation
    const strategy = getTypedMetadata(ComponentConstants.StrategyKey, TestService);
    const expression = getTypedMetadata(ComponentConstants.ExpressionKey, TestService);

    // Strategy might be empty object if no @Strategy decorator was used
    // But it should not be the hacked string value
    if (strategy !== undefined) {
      expect(strategy).not.toBe('HackedStrategy');
    }

    if (expression !== undefined) {
      expect(expression).not.toBe('hacked expression');
    }

    expect(instance).toBeInstanceOf(TestService);
  });

  test('should prevent external manipulation of post-construct metadata', async () => {
    @Service()
    class TestService {
      public onInit() {
        return 'initialized';
      }

      public getData() {
        return 'test data';
      }
    }

    // Try to manipulate post-construct metadata with string keys
    defineMetadata('component:postConstruct', 'hackedMethod', TestService);

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
      public getData() {
        return 'test data';
      }
    }

    // Try to manipulate override metadata with string keys
    defineMetadata('component:override', ['hackedMethod'], TestService);

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
      public getData() {
        return 'test data';
      }
    }

    // Try to manipulate interface metadata with string keys
    defineMetadata('component:interface', 'HackedInterface', TestService);

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
      public getData() {
        return 'test data';
      }
    }

    // Try to manipulate cron metadata with string keys
    defineMetadata('component:cron', '0 0 * * *', TestService);

    const container = new Container();

    await container.register('TestService', TestService, true);

    const instance = await container.resolve<TestService>('TestService');

    // Verify cron metadata wasn't changed
    const cron = getTypedMetadata(ComponentConstants.CronKey, TestService);

    expect(cron).toBeUndefined(); // Not '0 0 * * *'
    expect(instance).toBeInstanceOf(TestService);
  });

  // The attack has to be mounted against the description of the *real* key. Both of these
  // tests used to read keys 0.9.0 deleted (`ControllerConfigKey`, `RouteMiddlewaresKey`,
  // `RouteValidatorKey`), which made the expression `undefined`, `getMetadata(undefined, …)`
  // `undefined`, and the assertion unconditionally green. Nothing typechecks this directory,
  // so a reference to a deleted static member never surfaced.
  test('should prevent external manipulation of controller description metadata', async () => {
    @Controller({ path: '/test', description: 'the real description' })
    class TestController {
      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send('ok');
      }
    }

    // The string is exactly the Symbol's description - the whole point of Symbol keys is that
    // this is still a different key.
    defineMetadata('controller:description', 'hacked', TestController);

    const container = new Container();

    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    const description = getTypedMetadata(ComponentConstants.ControllerDescriptionKey, TestController);

    expect(description).toBe('the real description');
    expect(extractControllerRouteInfo(instance).description).toBe('the real description');
  });

  test('should prevent external manipulation of controller middlewares and route metadata', async () => {
    @Middleware()
    class RealMiddleware {
      public handle() {}
    }

    @Controller({ path: '/test', middlewares: [RealMiddleware] })
    class TestController {
      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send('ok');
      }
    }

    class HackedMiddleware {
      public handle() {}
    }

    // Same descriptions as the Symbols the framework actually writes
    defineMetadata('middleware:middlewares', [HackedMiddleware], TestController);
    defineMetadata('middleware:validator', 'HackedValidator', TestController);
    defineMetadata('controller:route', { hacked: { path: '/hacked', method: 'get' } }, TestController);

    const container = new Container();

    await container.register('TestController', TestController, true);

    const instance = await container.resolve<TestController>('TestController');

    // Identity, not length: the real guard has to still be the one in the list.
    const middlewares = getChainedTypedMetadataList(ComponentConstants.MiddlewaresKey, TestController);

    expect(middlewares).toEqual([RealMiddleware]);
    // @Middleware({ validator: true }) was never applied, so this stays false rather than
    // becoming the attacker's string
    expect(isValidator(TestController)).toBe(false);
    // The merged route map is what AsenaServer registers - `hacked` must not be in it
    expect(Object.keys(extractControllerRouteInfo(instance).routes)).toEqual(['test']);
  });

  test('should prevent external manipulation in factory pattern', async () => {
    @Service('SecureService')
    class SecureService {
      public getData() {
        return 'secure data';
      }
    }

    @Controller('/secure')
    class SecureController {
      @Inject(SecureService)
      public secureService: SecureService;

      @Get({ path: '/' })
      public getData(context: AsenaContext<any, any>) {
        return context.send(this.secureService.getData());
      }
    }

    // Try to manipulate metadata before factory creation
    defineMetadata('component:name', 'HackedService', SecureService);
    defineMetadata('controller:path', '/hacked', SecureController);

    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [SecureService, SecureController],
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
