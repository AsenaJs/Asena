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

  test('should serve health endpoint reporting transport state', async () => {
    const { HeadlessConfig, OrderHandler, transport } = defineApp();
    const healthPort = Math.floor(Math.random() * 55000) + 10000;

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
      adapter,
      logger,
      port: Math.floor(Math.random() * 55000) + 10000,
      components: [HeadlessConfig, OrderHandler],
    });

    await server.start();

    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);
    expect(server.coreContainer.container.has(ICoreServiceNames.ASENA_ADAPTER)).toBe(true);

    // Microservice messaging works in hybrid mode too
    const broker = await server.coreContainer.resolve<Ulak>(ICoreServiceNames.__ULAK__);

    expect(await broker.send('order.create', { total: 1 })).toEqual({ id: 1, total: 1 });
  });
});
