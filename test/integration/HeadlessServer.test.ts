import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServer, AsenaServerFactory } from '../../lib/server';
import { Config, Controller, MessageController, Service } from '../../lib/server/decorators';
import { EventPattern, InMemoryTransport, MessagePattern } from '../../lib/server/microservice';
import { Get } from '../../lib/server/web/decorators';
import { Inject } from '../../lib/ioc/component';
import { CoreBootstrapPhase, ICoreServiceNames } from '../../lib/ioc';
import { Ulak, ulak } from '../../lib/server/messaging';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for headless mode - starting without an HTTP adapter
 * The server boots with microservice messaging only: no HTTP port is opened.
 */
describe('Headless Server Integration', () => {
  let mockLogger: any;
  let warnings: string[];
  let server: AsenaServer<any> | undefined;

  beforeEach(() => {
    warnings = [];
    mockLogger = {
      info: () => {},
      warn: (message: string) => warnings.push(String(message)),
      error: () => {},
      profile: () => {},
    };
  });

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  function defineApp() {
    const transport = new InMemoryTransport();
    const received: any[] = [];

    @Config()
    class HeadlessConfig {
      public transport() {
        return { microservice: transport };
      }
    }

    const absolute: any[] = [];

    @MessageController('order')
    class OrderHandler {
      @MessagePattern('create')
      public async create(data: any) {
        return { id: 1, ...data };
      }

      // Prefix-joined: subscribes to 'order.completed', which is exactly what
      // ulak.messages('order').emit('completed') publishes
      @EventPattern('completed')
      public async onCompleted(data: any) {
        received.push(data);
      }

      // Absolute: another service's event vocabulary
      @EventPattern({ pattern: 'payment.completed', prefix: false })
      public async onPayment(data: any) {
        absolute.push(data);
      }
    }

    @Service()
    class CheckoutService {
      @Inject(ulak.messages('order'))
      public orders: Ulak.Messages<'order'>;
    }

    return { HeadlessConfig, OrderHandler, CheckoutService, transport, received, absolute };
  }

  test('should boot without adapter and reach SERVER_READY', async () => {
    const { HeadlessConfig, OrderHandler } = defineApp();

    server = await AsenaServerFactory.create({
      headless: true,
      logger: mockLogger,
      components: [HeadlessConfig, OrderHandler],
    });

    await server.start();

    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
    expect(server.coreContainer.container.has(ICoreServiceNames.ASENA_ADAPTER)).toBe(false);
  });

  test('should round-trip send and emit through Ulak', async () => {
    const { HeadlessConfig, OrderHandler, CheckoutService, received, absolute } = defineApp();

    server = await AsenaServerFactory.create({
      headless: true,
      logger: mockLogger,
      components: [HeadlessConfig, OrderHandler, CheckoutService],
    });

    await server.start();

    const broker = await server.coreContainer.resolve<Ulak>(ICoreServiceNames.__ULAK__);

    // Request/response through the prefix-joined pattern
    const reply = await broker.send<{ id: number; total: number }>('order.create', { total: 10 });

    expect(reply).toEqual({ id: 1, total: 10 });

    // Fire-and-forget event on an absolute pattern (prefix: false)
    await broker.emit('payment.completed', { orderId: 1 });
    expect(absolute).toEqual([{ orderId: 1 }]);

    // Injected scoped view works too
    const checkout = await server.coreContainer.container.resolve<any>('CheckoutService');
    const scopedReply = await (checkout as any).orders.send('create', { total: 3 });

    expect(scopedReply).toEqual({ id: 1, total: 3 });

    // The point of the uniform prefix rule: the scoped view's emit and the
    // prefix-joined @EventPattern agree on the same name ('order.completed')
    await (checkout as any).orders.emit('completed', { orderId: 3 });
    expect(received).toEqual([{ orderId: 3 }]);
  });

  test('should throw when message controllers exist without a transport', async () => {
    @MessageController()
    class LonelyHandler {
      @MessagePattern('ping')
      public async ping() {
        return 'pong';
      }
    }

    server = await AsenaServerFactory.create({
      headless: true,
      logger: mockLogger,
      components: [LonelyHandler],
    });

    await expect(server.start()).rejects.toThrow(/no microservice transport configured/);
    server = undefined;
  });

  test('should warn about HTTP-only components in headless mode', async () => {
    const { HeadlessConfig, OrderHandler } = defineApp();

    @Controller('/http')
    class HttpController {
      @Get({ path: '/' })
      public get() {}
    }

    server = await AsenaServerFactory.create({
      headless: true,
      logger: mockLogger,
      components: [HeadlessConfig, OrderHandler, HttpController],
    });

    await server.start();

    expect(warnings.some((message) => message.includes('HttpController'))).toBe(true);
  });

  /**
   * KNOWN BUG (0.9.0, unfixed at the time of writing) - see the audit report.
   *
   * `warnAdapterlessComponents` reads the component-type marker with the chained
   * `getTypedMetadata`. Component type is own-only everywhere else - `Container.filterServices`,
   * `IocEngine.isValidComponent`, `isController`, `createWebTest` - so this one reader answers
   * CONTROLLER for a @Service whose base happens to be one, and the startup warning names a
   * class that is not a controller and is not being ignored.
   *
   * Log-only, but it is a startup warning that tells the user to go fix something that is not
   * broken, and it disagrees with the container it is describing.
   */
  test('should not report a @Service extending a @Controller as an HTTP-only component', async () => {
    const { HeadlessConfig, OrderHandler } = defineApp();

    @Controller('/base')
    class BaseHttpController {
      @Get({ path: '/' })
      public get() {}
    }

    @Service('DerivedDomainService')
    class DerivedDomainService extends BaseHttpController {}

    server = await AsenaServerFactory.create({
      headless: true,
      logger: mockLogger,
      components: [HeadlessConfig, OrderHandler, BaseHttpController, DerivedDomainService],
    });

    await server.start();

    const headlessWarning = warnings.find((message) => message.includes('require an HTTP adapter'));

    expect(headlessWarning).toContain('BaseHttpController');
    expect(headlessWarning).not.toContain('DerivedDomainService');
  });

  test('should serve health endpoint reporting transport state', async () => {
    const { HeadlessConfig, OrderHandler, transport } = defineApp();
    // 10000-31999: above the well-known range and below the kernel's ephemeral floor
    // (net.ipv4.ip_local_port_range, 32768-60999). Drawing a *server* port from the
    // ephemeral range collides with the outbound sockets the suite itself holds open -
    // including their 60s TIME_WAIT - and Bun.serve then fails with EADDRINUSE.
    const healthPort = 10000 + Math.floor(Math.random() * 22000);

    server = await AsenaServerFactory.create({
      headless: true,
      logger: mockLogger,
      components: [HeadlessConfig, OrderHandler],
      health: { port: healthPort },
    });

    await server.start();

    const response = await fetch(`http://localhost:${healthPort}/healthz`);
    const body: any = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('up');
    expect(body.transports.default).toBe('connected');

    // Unknown paths return 404
    const notFound = await fetch(`http://localhost:${healthPort}/other`);

    expect(notFound.status).toBe(404);

    // Degraded transport → 503
    Object.defineProperty(transport, 'isConnected', { get: () => false });

    const degraded = await fetch(`http://localhost:${healthPort}/healthz`);
    const degradedBody: any = await degraded.json();

    expect(degraded.status).toBe(503);
    expect(degradedBody.status).toBe('degraded');
    expect(degradedBody.transports.default).toBe('disconnected');
  });

  test('should keep HTTP mode behavior unchanged (regression)', async () => {
    const { HeadlessConfig, OrderHandler } = defineApp();
    const { adapter, logger } = createMockAdapter();

    server = await AsenaServerFactory.create({
      // createMockAdapter() is deliberately partial - it implements only the AsenaAdapter
      // members the bootstrap path calls, so tests can assert on `adapter.registerRoute.mock`.
      // Widening it here is the same suppression the sibling suites already use
      // (FactoryOverrides, DuplicateRouteDetection, createWebTest). It hides a missing
      // *declaration*, never a missing implementation: anything the framework calls that the
      // mock does not have still throws at runtime.
      adapter: adapter as unknown as Parameters<typeof AsenaServerFactory.create>[0]['adapter'],
      logger,
      port: 10000 + Math.floor(Math.random() * 22000),
      components: [HeadlessConfig, OrderHandler],
    });

    await server.start();

    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
    expect(server.coreContainer.container.has(ICoreServiceNames.ASENA_ADAPTER)).toBe(true);

    // Microservice messaging works in hybrid mode too
    const broker = await server.coreContainer.resolve<Ulak>(ICoreServiceNames.__ULAK__);

    expect(await broker.send<{ id: number; total: number }>('order.create', { total: 1 })).toEqual({
      id: 1,
      total: 1,
    });
  });
});
