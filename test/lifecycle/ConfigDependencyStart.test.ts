import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Config, Controller, Middleware, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { Inject, OnStart } from '../../lib/ioc/component';
import { AsenaMiddlewareService } from '../../lib/server/web/middleware';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * Where a @Config's *dependencies* stand when its hooks are read: started, all of them.
 *
 * This file exists because that was briefly not true, and nothing caught it. When `@OnStart`
 * moved out of `Container.register()` it landed *after* APPLICATION_SETUP, which is where the
 * framework reads the config. Topological order still guaranteed the injected component was
 * **constructed** before the config - it no longer guaranteed the component had **started**.
 *
 * The damage ran along one line: whether the framework *calls* a config hook during setup or
 * merely *binds* it and calls it per request.
 *
 *   called during setup  -> serveOptions(), globalMiddlewares(), transport()   <- broke
 *   bound, called later  -> onError(), onNotFound()                            <- fine either way
 *
 * `transport()` was the worst of them, and it is the shape the redis and kafka packages
 * document: `prepareMicroservices()` goes on to `init()` and `listen()` whatever it returned, so
 * a transport built from an injected service reached for a connection whose `@OnStart` had not
 * opened it, and the boot died pointing at the wrong component. The other two failed silently.
 *
 * `start()` now runs the hooks before application setup. These tests hold that line: four of
 * them fail if it ever moves back down, and the last one fails if it moves too far up, past the
 * point where the socket binds.
 */

const events: string[] = [];

/**
 * Models the shape every connection-owning framework package uses: a component that is inert
 * until its start hook runs, and whose accessor refuses to hand out a half-built resource
 * rather than returning undefined. `AsenaRedisService.client` is exactly this.
 */
@Service()
class ConnectionService {
  private client: string | null = null;

  public statusTable: Record<string, number> = {};

  @OnStart()
  public async connect() {
    this.client = 'connected';
    this.statusTable = { NOT_FOUND: 404 };
    events.push('connection:start');
  }

  public get started(): boolean {
    return this.client !== null;
  }

  public getClient(): string {
    if (!this.client) {
      throw new Error('Connection not initialized. Service may not have started properly.');
    }

    return this.client;
  }
}

/**
 * A transport built from the injected service, borrowing its connection in `init()` - the
 * shape `RedisMicroserviceTransport` and `KafkaMicroserviceTransport` both have. The
 * constructor only stores the reference, so the damage does not surface until `init()`.
 */
class BorrowingTransport {
  public readonly source: ConnectionService;

  public constructor(source: ConnectionService) {
    this.source = source;
  }

  public async init(): Promise<void> {
    events.push(`transport:init(${this.source.getClient()})`);
  }

  public async listen(): Promise<void> {
    events.push('transport:listen');
  }

  public async send(): Promise<void> {}

  public async close(): Promise<void> {}

  public registerHandler(): void {}
}

/**
 * A mock adapter that matches how the shipped adapters treat each hook, because that is what
 * decides whether a hook body runs during setup or later:
 * - `serveOptions(fn)` invokes `fn` immediately (both HonoAdapter and Ergenecore do)
 * - `onError(fn)` / `onNotFound(fn)` only store `fn`; the router calls it per request
 */
const createConfigAwareAdapter = () => {
  const { adapter } = createMockAdapter();
  const captured: { onError?: any; onNotFound?: any } = {};

  (adapter as any).serveOptions = mock(async (options: () => any) => {
    await options();
  });
  (adapter as any).onError = mock((handler: any) => {
    captured.onError = handler;
  });
  (adapter as any).onNotFound = mock((handler: any) => {
    captured.onNotFound = handler;
  });
  (adapter as any).getWebsocketAdapter = mock(() => undefined);

  return { adapter, captured };
};

const createServer = (components: any[], adapter: any) =>
  AsenaServerFactory.create({
    adapter,
    logger: silentLogger,
    components,
    shutdown: { signals: false },
    keepAlive: false,
  });

describe('a @Config whose dependency carries an @OnStart', () => {
  beforeEach(() => {
    events.length = 0;
  });

  describe('hooks the framework calls during application setup', () => {
    test('transport() runs against a dependency that already started', async () => {
      const observed: { started?: boolean } = {};

      @Config()
      class TransportConfig {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        public transport() {
          observed.started = this.connection.started;
          events.push('config:transport');

          // An inert but well-formed return: normalizeTransportConfig rejects an object with
          // none of its known fields, and what is under test here is the timing, not the shape.
          return { interceptors: [] };
        }
      }

      const { adapter } = createConfigAwareAdapter();
      const server = await createServer([ConnectionService, TransportConfig], adapter);

      await server.start();

      // The assertion that matters is the pair: the hook ran, and it ran second. Asserting only
      // `started === true` would still pass if transport() were never called at all.
      expect(events).toEqual(['connection:start', 'config:transport']);
      expect(observed.started).toBe(true);

      await server.stop();
    });

    test('a transport that borrows the dependency in init() boots', async () => {
      // The shape the redis and kafka packages document:
      //
      //   public transport() {
      //     return { microservice: new RedisMicroserviceTransport(this.redis, { ... }) };
      //   }
      //
      // prepareMicroservices() calls init() in the same phase the config is read, so this only
      // works if the connection is already open by then. It briefly was not, and the boot died
      // with "Redis client not initialized" - naming the service rather than the ordering that
      // actually broke it.
      @Config()
      class BorrowingConfig {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        public transport() {
          return { microservice: new BorrowingTransport(this.connection) as any };
        }
      }

      const { adapter } = createConfigAwareAdapter();
      const server = await createServer([ConnectionService, BorrowingConfig], adapter);

      await server.start();

      // init() interpolates the client it fetched, so this fails with "Connection not
      // initialized" - not merely a missing line - if the ordering ever regresses.
      expect(events).toContain('connection:start');
      expect(events).toContain('transport:init(connected)');

      await server.stop();
    });

    test('globalMiddlewares() sees a started dependency, including a captured value', async () => {
      const observed: { started?: boolean; table?: Record<string, number> } = {};

      @Middleware()
      class PassThroughMiddleware extends AsenaMiddlewareService {
        public handle(_context: any, next: any) {
          return next();
        }
      }

      @Config()
      class MiddlewareConfig {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        public globalMiddlewares() {
          observed.started = this.connection.started;
          // The capturing shape, and the reason this hook is worth a test of its own: a value
          // read here is frozen at setup time. There is no later read to save it, so if the
          // dependency were cold this would silently compute a middleware list from nothing.
          observed.table = { ...this.connection.statusTable };
          events.push('config:globalMiddlewares');

          return [PassThroughMiddleware];
        }
      }

      const { adapter } = createConfigAwareAdapter();
      const server = await createServer([ConnectionService, PassThroughMiddleware, MiddlewareConfig], adapter);

      await server.start();

      expect(events).toEqual(['connection:start', 'config:globalMiddlewares']);
      expect(observed.started).toBe(true);
      expect(observed.table).toEqual({ NOT_FOUND: 404 });

      await server.stop();
    });

    test('serveOptions() sees a started dependency', async () => {
      const observed: { started?: boolean } = {};

      @Config()
      class ServeOptionsConfig {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        public serveOptions() {
          observed.started = this.connection.started;
          events.push('config:serveOptions');

          return {};
        }
      }

      const { adapter } = createConfigAwareAdapter();
      const server = await createServer([ConnectionService, ServeOptionsConfig], adapter);

      await server.start();

      // Both shipped adapters `await options()` rather than storing the callback, so this hook
      // is genuinely called during setup - the mock adapter here models that on purpose. A mock
      // that only stored it would report this hook as safe no matter what the ordering did.
      expect(events).toEqual(['connection:start', 'config:serveOptions']);
      expect(observed.started).toBe(true);

      await server.stop();
    });
  });

  describe('hooks the framework only binds during setup', () => {
    test('onError() and onNotFound() run against a started dependency', async () => {
      const observed: { onError?: boolean; onNotFound?: boolean } = {};

      @Config()
      class HandlerConfig {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        public onError(_error: Error, context: any) {
          observed.onError = this.connection.started;

          return context.send({ status: this.connection.statusTable.NOT_FOUND }, 500);
        }

        public onNotFound(context: any) {
          observed.onNotFound = this.connection.started;

          return context.send({ status: this.connection.statusTable.NOT_FOUND }, 404);
        }
      }

      const { adapter, captured } = createConfigAwareAdapter();
      const server = await createServer([ConnectionService, HandlerConfig], adapter);

      await server.start();

      // Registered during setup, invoked now - which is the whole reason these two are safe.
      const send = mock((data: any, status?: number) => ({ data, status }));

      await captured.onError!(new Error('boom'), { send });
      await captured.onNotFound!({ send }, { path: '/missing', method: 'GET' });

      expect(observed.onError).toBe(true);
      expect(observed.onNotFound).toBe(true);

      // Reading through to the value proves the dependency was usable, not merely flagged
      // started. A stale read would have produced `undefined` here.
      expect(send.mock.calls).toEqual([
        [{ status: 404 }, 500],
        [{ status: 404 }, 404],
      ]);

      await server.stop();
    });

    test('a global middleware and a controller both see a started dependency', async () => {
      const observed: { middleware?: boolean; controller?: boolean; client?: string } = {};

      @Middleware()
      class ConnectionMiddleware extends AsenaMiddlewareService {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        public handle(_context: any, next: any) {
          observed.middleware = this.connection.started;

          return next();
        }
      }

      @Controller('/api')
      class PingController {
        @Inject(ConnectionService)
        private connection: ConnectionService;

        @Get('/ping')
        public ping(context: any) {
          observed.controller = this.connection.started;
          // Read through to the resource rather than the flag: `getClient()` throws when the
          // start hook has not run, so this line is the assertion the handler makes itself.
          observed.client = this.connection.getClient();

          return context.send(observed.client);
        }
      }

      @Config()
      class RequestTimeConfig {
        public globalMiddlewares() {
          return [ConnectionMiddleware];
        }
      }

      const { adapter } = createConfigAwareAdapter();
      const server = await createServer(
        [ConnectionService, ConnectionMiddleware, PingController, RequestTimeConfig],
        adapter,
      );

      await server.start();

      // A real trip through the adapter's dispatch, not a direct call on the instance: the
      // middleware the adapter holds is a bound `handle`, and binding happens during setup.
      // What this proves is that binding early does not capture early state.
      await (adapter as any).testRequest('get', '/api/ping');

      expect(observed.client).toBe('connected');
      expect(observed.middleware).toBe(true);
      expect(observed.controller).toBe(true);

      await server.stop();
    });

    test('the socket binds only after every start hook has run', async () => {
      // This is what makes the request-time path safe, and it is a property of start()'s
      // ordering rather than of any one hook: the adapter is not asked to listen until the
      // lifecycle has finished, so there is no window in which a request meets a cold
      // component. Move `lifecycleService.start()` below `adapter.start()` and only this
      // test fails - the two above would keep passing, because they drive the adapter by hand.
      @Config()
      class PlainConfig {}

      const { adapter } = createConfigAwareAdapter();

      (adapter as any).start = mock(async () => {
        events.push('adapter:start');
      });

      const server = await createServer([ConnectionService, PlainConfig], adapter);

      await server.start();

      expect(events).toEqual(['connection:start', 'adapter:start']);

      await server.stop();
    });
  });
});
