import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import type { TestApp } from '../../lib/test/harness/types';
import { buildDevtoolsSnapshot } from '../../lib/devtools/snapshot';
import type { DevtoolsSnapshot } from '../../lib/devtools/protocol';
import { Config, Controller, ExceptionHandler, Middleware, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { Catch } from '../../lib/server/exception';
import type { AsenaContext, AsenaNextHandler } from '../../lib/adapter';
import { HTTP_EXCEPTION } from '../../lib/adapter/types/HttpException';
import { createMockAdapter } from '../utils/createMockContext';
import { AdminPages, AppConfig, fixtureComponents, ItemDraft } from './fixtures/app';

const SNAPSHOT_FILE = join(import.meta.dir, 'fixtures', 'snapshot.json');

// The mock adapter has none of these; a real adapter always has onError and registerHTMLRoute, and may have onNotFound.
const bootFixture = async (components: any[]): Promise<TestApp> => {
  const { adapter } = createMockAdapter();

  (adapter as any).onError = mock(() => {});
  (adapter as any).onNotFound = mock(() => {});
  (adapter as any).registerHTMLRoute = mock(() => {});

  return createTestApp({ adapter: adapter as any, logger: silentLogger, components });
};

describe('buildDevtoolsSnapshot', () => {
  let app: TestApp;
  let snapshot: DevtoolsSnapshot;
  let draftsBeforeSnapshot: number;
  let configCallsBeforeSnapshot: number;
  let pageCallsBeforeSnapshot: number;

  beforeAll(async () => {
    process.env.DEVTOOLS_FIXTURE_REGION = 'eu-west';
    delete process.env.DEVTOOLS_FIXTURE_PAGE_SIZE;

    app = await bootFixture(fixtureComponents);

    draftsBeforeSnapshot = ItemDraft.constructed;
    configCallsBeforeSnapshot = AppConfig.globalMiddlewareCalls;
    pageCallsBeforeSnapshot = AdminPages.pageCalls;
    snapshot = await buildDevtoolsSnapshot(app.container);
  });

  afterAll(async () => {
    await app?.stop();
    delete process.env.DEVTOOLS_FIXTURE_REGION;
  });

  test('lists user components only, each once, by name', () => {
    expect(snapshot.components.map((component) => component.name)).toEqual([
      'AdminPages',
      'ApiExceptionHandler',
      'AppConfig',
      'AuditTrail',
      'CorsHeaders',
      'CreateItemValidator',
      'DollarFormatter',
      'EuroFormatter',
      'InventoryHandler',
      'ItemController',
      'ItemDraft',
      'ItemEvents',
      'ItemFeed',
      'ItemImages',
      'ItemService',
      'NightlyCleanup',
      'PassThroughPostProcessor',
      'RequestTimer',
    ]);
  });

  test('describes type, scope, class name and @Implements interfaces', () => {
    const byName = Object.fromEntries(snapshot.components.map((component) => [component.name, component]));

    expect(byName.ItemController.type).toBe('CONTROLLER');
    expect(byName.AdminPages.type).toBe('FRONTEND_CONTROLLER');
    expect(byName.ItemImages.type).toBe('MIDDLEWARE');
    expect(byName.ItemService.type).toBe('SERVICE');
    expect(byName.RequestTimer.type).toBe('MIDDLEWARE');
    expect(byName.RequestTimer.className).toBe('RequestTimerMiddleware');
    expect(byName.CreateItemValidator.type).toBe('MIDDLEWARE');
    expect(byName.ItemFeed.type).toBe('WEBSOCKET');
    expect(byName.NightlyCleanup.type).toBe('SCHEDULE');
    expect(byName.ItemEvents.type).toBe('EVENT');
    expect(byName.InventoryHandler.type).toBe('MESSAGE_CONTROLLER');
    expect(byName.PassThroughPostProcessor.type).toBe('POST_PROCESSOR');
    expect(byName.AppConfig.type).toBe('CONFIG');
    expect(byName.ApiExceptionHandler.type).toBe('EXCEPTION_HANDLER');

    expect(byName.ItemService.scope).toBe('singleton');
    expect(byName.ItemDraft.scope).toBe('prototype');

    expect(byName.EuroFormatter.interfaces).toEqual(['PriceFormatter']);
    expect(byName.DollarFormatter.interfaces).toEqual(['PriceFormatter']);
    expect(byName.ItemService.interfaces).toEqual([]);
  });

  test('describes injected, strategy and soft dependencies as graph edges', () => {
    const byName = Object.fromEntries(snapshot.components.map((component) => [component.name, component]));

    expect(byName.ItemService.dependencies).toEqual([
      { field: 'formatters', target: 'PriceFormatter', kind: 'strategy' },
    ]);

    // A controller holds its middlewares by name only, which is what makes them soft edges.
    expect(byName.ItemController.dependencies).toEqual([
      { field: 'itemService', target: 'ItemService', kind: 'inject' },
      { field: null, target: 'AuditTrail', kind: 'soft' },
      { field: null, target: 'RequestTimer', kind: 'soft' },
    ]);
  });

  test('describes @Value fields without ever carrying the value', () => {
    const itemService = snapshot.components.find((component) => component.name === 'ItemService')!;

    expect(itemService.values).toEqual([
      { field: 'pageSize', key: 'DEVTOOLS_FIXTURE_PAGE_SIZE', hasDefault: true, parsed: true, isSet: false },
      { field: 'region', key: 'DEVTOOLS_FIXTURE_REGION', hasDefault: false, parsed: false, isSet: true },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('eu-west');
  });

  test('describes routes with the full path, the middleware chain, the validation source and static serving', () => {
    expect(snapshot.routes).toEqual([
      {
        controller: 'ItemController',
        method: 'create',
        httpMethod: 'POST',
        path: '/items/',
        middlewares: ['AuditTrail', 'RequestTimer'],
        validator: 'CreateItemValidator',
        contract: null,
        hasBodySchema: true,
        staticServe: false,
      },
      {
        controller: 'ItemController',
        method: 'find',
        httpMethod: 'GET',
        path: '/items/:id',
        middlewares: ['AuditTrail'],
        validator: null,
        contract: null,
        hasBodySchema: false,
        staticServe: false,
      },
      {
        controller: 'ItemController',
        method: 'rename',
        httpMethod: 'PUT',
        path: '/items/:id/name',
        middlewares: ['AuditTrail'],
        validator: null,
        contract: 'RenameItemContext',
        hasBodySchema: true,
        staticServe: false,
      },
      {
        controller: 'ItemController',
        method: 'images',
        httpMethod: 'GET',
        path: '/items/images/*',
        middlewares: ['AuditTrail'],
        validator: null,
        contract: null,
        hasBodySchema: false,
        staticServe: true,
      },
    ]);
  });

  test('paths agree with what the server registered on the adapter', () => {
    const adapter = (app.server.coreContainer.container.services.AsenaAdapter as any).instance;
    const registered = adapter.registerRoute.mock.calls.map(([route]: any[]) => `${route.method} ${route.path}`);
    const staticRoutes = adapter.registerRoute.mock.calls
      .filter(([route]: any[]) => route.staticServe !== undefined)
      .map(([route]: any[]) => route.path);

    expect(snapshot.routes.map((route) => `${route.httpMethod.toLowerCase()} ${route.path}`).sort()).toEqual(
      registered.sort(),
    );
    expect(snapshot.routes.filter((route) => route.staticServe).map((route) => route.path)).toEqual(staticRoutes);
  });

  // HTML routes bypass the middleware chain, so F3 lists them apart from the routes.
  test('lists @FrontendController pages without calling the @Page methods', () => {
    const adapter = (app.server.coreContainer.container.services.AsenaAdapter as any).instance;
    const registered = adapter.registerHTMLRoute.mock.calls.map(([path]: any[]) => path);

    expect(snapshot.pages).toEqual([
      { controller: 'AdminPages', method: 'home', path: '/admin' },
      { controller: 'AdminPages', method: 'reports', path: '/admin/reports' },
    ]);
    expect(snapshot.pages!.map((page) => page.path).sort()).toEqual(registered.sort());
    expect(AdminPages.pageCalls).toBe(pageCallsBeforeSnapshot);
  });

  test('describes websockets, schedules, @On events and message handlers with prefixes applied', () => {
    expect(snapshot.websockets).toEqual([{ namespace: 'ws/items', component: 'ItemFeed' }]);
    expect(snapshot.schedules).toEqual([{ name: 'NightlyCleanup', cron: '0 3 * * *' }]);

    // A skipped handler registers nothing, so it is not something F5 can emit to.
    expect(snapshot.events).toEqual([
      { component: 'ItemEvents', method: 'onAudit', event: 'audit.*' },
      { component: 'ItemEvents', method: 'onCreated', event: 'item.created' },
    ]);

    expect(snapshot.messageHandlers).toEqual([
      {
        controller: 'InventoryHandler',
        method: 'onRestocked',
        pattern: 'inventory.restocked',
        kind: 'event',
        transport: 'default',
      },
      {
        controller: 'InventoryHandler',
        method: 'reserve',
        pattern: 'inventory.reserve',
        kind: 'message',
        transport: 'default',
      },
    ]);
  });

  // F7 answers "who catches this?" by walking these chains the way ExceptionRegistry walks constructors.
  test('describes exception handlers: typed @Catch with ancestor chains, the catch-all and @NotFound', () => {
    expect(snapshot.exceptionHandlers).toEqual([
      {
        component: 'ApiExceptionHandler',
        catches: [
          {
            method: 'conflict',
            types: [
              {
                name: 'ItemConflict',
                chain: ['ItemConflict', 'ConflictException', 'HttpException', 'Error'],
                httpException: true,
              },
            ],
          },
          { method: 'fallback', types: 'catch-all' },
          {
            method: 'known',
            types: [
              { name: 'ItemMissing', chain: ['ItemMissing', 'ItemError', 'Error'] },
              { name: 'ItemRejected', chain: ['ItemRejected', 'ItemError', 'Error'] },
            ],
          },
        ],
        notFound: 'missingRoute',
      },
    ]);
  });

  test('describes the @Config and its global middlewares in declaration order', () => {
    expect(snapshot.config).toEqual({
      component: 'AppConfig',
      hasOnError: false,
      hasOnNotFound: false,
      globalMiddlewares: [{ middleware: 'CorsHeaders', exclude: ['/health'] }],
    });
  });

  test('constructs nothing: a transient nobody injects stays unbuilt', () => {
    expect(ItemDraft.constructed).toBe(draftsBeforeSnapshot);
    expect(ItemDraft.constructed).toBe(0);
  });

  // The one call metadata cannot replace. WP-1 should capture the list at prepareConfigs() instead.
  test('asks the @Config for its global middlewares once more', () => {
    expect(AppConfig.globalMiddlewareCalls).toBe(configCallsBeforeSnapshot + 1);
  });

  test('is deterministic and matches the committed fixture the UI is built against', async () => {
    const again = await buildDevtoolsSnapshot(app.container);

    expect(again).toEqual(snapshot);

    if (process.env.DEVTOOLS_WRITE_SNAPSHOT === '1') {
      await Bun.write(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
    }

    expect(snapshot).toEqual(await Bun.file(SNAPSHOT_FILE).json());
  });
});

describe('buildDevtoolsSnapshot config edge cases', () => {
  test('reports the deprecated onError / onNotFound hooks', async () => {
    @Config()
    class LegacyHooksConfig {
      public onError() {
        return new Response(null, { status: 500 });
      }

      public onNotFound() {
        return new Response(null, { status: 404 });
      }
    }

    await using app = await bootFixture([LegacyHooksConfig]);

    expect((await buildDevtoolsSnapshot(app.container)).config).toEqual({
      component: 'LegacyHooksConfig',
      hasOnError: true,
      hasOnNotFound: true,
      globalMiddlewares: [],
    });
  });

  test('describes an app without a @Config', async () => {
    @Service()
    class LoneService {}

    await using app = await bootFixture([LoneService]);

    const snapshot = await buildDevtoolsSnapshot(app.container);

    expect(snapshot.config).toEqual({ hasOnError: false, hasOnNotFound: false, globalMiddlewares: [] });
    expect(snapshot.components.map((component) => component.name)).toEqual(['LoneService']);
  });
});

describe('buildDevtoolsSnapshot caught types', () => {
  // The hono adapter brands hono's HTTPException on its prototype; the registry matches it without any shared class.
  test('flags a foreign class branded on its prototype, and stops the chain before Object', async () => {
    class ForeignHttpError {}

    Object.defineProperty(ForeignHttpError.prototype, HTTP_EXCEPTION, { value: true });

    class PlainFailure {}

    @ExceptionHandler()
    class ForeignHandler {
      @Catch(ForeignHttpError, PlainFailure)
      public foreign() {}
    }

    await using app = await bootFixture([ForeignHandler]);

    expect((await buildDevtoolsSnapshot(app.container)).exceptionHandlers).toEqual([
      {
        component: 'ForeignHandler',
        catches: [
          {
            method: 'foreign',
            types: [
              { name: 'ForeignHttpError', chain: ['ForeignHttpError'], httpException: true },
              { name: 'PlainFailure', chain: ['PlainFailure'] },
            ],
          },
        ],
      },
    ]);
  });
});

describe('buildDevtoolsSnapshot inheritance', () => {
  // IocEngine orders creation by soft dependencies collected across the class chain; the graph must show the same edges.
  test('carries the soft edges of a route inherited from a base controller', async () => {
    @Middleware()
    class BaseGuard {
      public async handle(_context: AsenaContext<any, any>, next: AsenaNextHandler) {
        await next();
      }
    }

    class BaseResource {
      @Get({ path: '/', middlewares: [BaseGuard] })
      public list(context: AsenaContext<any, any>) {
        return context.send([]);
      }
    }

    @Controller('/things')
    class ThingController extends BaseResource {}

    await using app = await bootFixture([BaseGuard, ThingController]);

    const snapshot = await buildDevtoolsSnapshot(app.container);
    const thing = snapshot.components.find((component) => component.name === 'ThingController')!;

    expect(snapshot.routes.map((route) => [route.path, route.middlewares])).toEqual([['/things/', ['BaseGuard']]]);
    expect(thing.dependencies).toEqual([{ field: null, target: 'BaseGuard', kind: 'soft' }]);
  });
});
