import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { DevtoolsBus, devtoolsBus } from '../../lib/devtools/DevtoolsBus';
import type { DevtoolsServerContext } from '../../lib/devtools/context';
import type { DevtoolsRequestRecord } from '../../lib/devtools/protocol';
import type { AsenaContext, AsenaNextHandler } from '../../lib/adapter';
import {
  ASENA_CONTEXT_ADAPTER,
  ASENA_CONTEXT_CONTRACT,
  defineRequestSchemas,
  prepareContextValidation,
  type RequestSchema,
} from '../../lib/adapter/RequestContract';
import {
  Config,
  Controller,
  EventService,
  ExceptionHandler,
  MessageController,
  Middleware,
  Schedule,
} from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { On } from '../../lib/server/event';
import { EventPattern, InMemoryTransport, MessagePattern } from '../../lib/server/microservice';
import { Catch, NotFound } from '../../lib/server/exception';
import type { AsenaSchedule } from '../../lib/server/schedule';
import { AsenaServerFactory } from '../../lib/server';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { bootWithMockAdapter, installDevtoolsHook, mockAdapterOf } from './helpers';

const next: AsenaNextHandler = async () => {};

describe('DevtoolsBus', () => {
  test('disabled: hands wrapped functions back untouched and holds no storage', () => {
    const bus = new DevtoolsBus();
    const fn = () => 'answer';

    expect(bus.enabled).toBe(false);
    expect(bus.wrap('controller', 'A.b', fn)).toBe(fn);
    expect((bus as any).storage).toBeUndefined();
    expect((bus as any).contractNames).toBeUndefined();

    bus.step('controller', 'A.b');
    bus.nameContract({}, 'Ignored');

    expect((bus as any).contractNames).toBeUndefined();
  });

  test('records the steps of the current async context only', async () => {
    const bus = new DevtoolsBus();
    const records: DevtoolsRequestRecord[] = [];

    bus.enable();
    bus.subscribe((record) => records.push(record));

    const first = bus.open('GET', '/a');
    const second = bus.open('GET', '/b');
    const step = bus.wrap('controller', 'Shelf.list', async (label: string) => {
      await Bun.sleep(1);
      bus.step('catch', `Errors.${label}`);
    });

    await Promise.all([bus.run(first, () => step('a')), bus.run(second, () => step('b'))]);
    bus.step('controller', 'Outside.record');

    bus.close(first, 200);
    bus.close(second, 410, { kind: 'controller', name: 'Shelf.list' });

    expect(
      records.map(({ method, path, status, steps, answeredBy }) => ({ method, path, status, steps, answeredBy })),
    ).toEqual([
      {
        method: 'GET',
        path: '/a',
        status: 200,
        steps: [
          { kind: 'controller', name: 'Shelf.list' },
          { kind: 'catch', name: 'Errors.a' },
        ],
        answeredBy: { kind: 'catch', name: 'Errors.a' },
      },
      {
        method: 'GET',
        path: '/b',
        status: 410,
        steps: [
          { kind: 'controller', name: 'Shelf.list' },
          { kind: 'catch', name: 'Errors.b' },
        ],
        answeredBy: { kind: 'controller', name: 'Shelf.list' },
      },
    ]);
    expect(records[0].id).not.toBe(records[1].id);
    expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('observe keeps a synchronous throw synchronous and frames success and failure', async () => {
    const bus = new DevtoolsBus();
    const records: DevtoolsRequestRecord[] = [];
    const failure = new Error('sync');

    bus.enable();
    bus.subscribe((record) => records.push(record));

    expect(bus.observe('@On', 'a', 'H.a', () => 1)).toBe(1);
    expect(() =>
      bus.observe('@On', 'b', 'H.b', () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(await bus.observe('@On', 'c', 'H.c', async () => 'later')).toBe('later');
    expect(bus.observe('@On', 'd', 'H.d', () => Promise.reject(failure))).rejects.toBe(failure);
    await Bun.sleep(1);

    expect(records.map(({ path, status, answeredBy }) => [path, status, answeredBy.name])).toEqual([
      ['a', 200, 'H.a'],
      ['b', 500, 'H.b'],
      ['c', 200, 'H.c'],
      ['d', 500, 'H.d'],
    ]);
  });

  test('without a listener, closing a record delivers nothing', () => {
    const bus = new DevtoolsBus();
    const listener = mock(() => {});

    bus.enable();

    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.close(bus.open('GET', '/'), 200, { kind: 'controller', name: 'X.y' });

    expect(listener).not.toHaveBeenCalled();
  });
});

const acceptAnything: RequestSchema = {
  '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
};

class ShelfContext {
  public static readonly [ASENA_CONTEXT_CONTRACT] = defineRequestSchemas({ query: acceptAnything });

  public static readonly [ASENA_CONTEXT_ADAPTER] = 'MockAdapter';
}

class Gone extends Error {}

@Middleware()
class Stamp {
  public async handle(_context: AsenaContext<any, any>, proceed: AsenaNextHandler) {
    await proceed();
  }
}

@Middleware()
class Guard {
  public async handle(_context: AsenaContext<any, any>, proceed: AsenaNextHandler) {
    await proceed();
  }
}

@Middleware()
class Throttle {
  public async handle(_context: AsenaContext<any, any>, proceed: AsenaNextHandler) {
    await proceed();
  }
}

@Controller({ path: '/shelves', middlewares: [Guard] })
class ShelfController {
  @Get({ path: '/', middlewares: [Throttle] })
  public list(context: AsenaContext<any, any>) {
    return context.send([]);
  }

  @Get('/:id')
  public find(context: ShelfContext) {
    return context;
  }
}

@ExceptionHandler()
class ShelfErrors {
  @Catch(Gone)
  public gone() {
    return new Response('gone', { status: 410 });
  }

  @NotFound()
  public missing() {
    return undefined;
  }
}

@Config()
class ShelfConfig {
  public globalMiddlewares() {
    return [Stamp];
  }

  public onError() {
    return new Response('config', { status: 500 });
  }

  public onNotFound() {
    return new Response('not found', { status: 404 });
  }
}

@Config()
class LoneHooksConfig {
  public onError() {
    return new Response('config', { status: 500 });
  }

  public onNotFound() {
    return new Response('not found', { status: 404 });
  }
}

const shelfApp = [Stamp, Guard, Throttle, ShelfController, ShelfErrors, ShelfConfig];

const routeOf = (adapter: any, path: string) =>
  adapter.registerRoute.mock.calls.map(([route]: any[]) => route).find((route: any) => route.path === path);

/** Runs `fn` inside a record, the way a WP-2 adapter will frame a request. */
const inRecord = async (fn: () => unknown): Promise<string[]> => {
  const record = devtoolsBus.open('GET', '/');

  await devtoolsBus.run(record, fn);

  return record.steps.map(({ kind, name }) => `${kind} ${name}`);
};

describe('DevtoolsBus HTTP emit sites (core-visible steps)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installDevtoolsHook(() => undefined);
  });

  afterEach(() => {
    restore();
  });

  test('global, controller and route middlewares, the contract validator and the controller', async () => {
    await using app = await bootWithMockAdapter(shelfApp);
    const adapter = mockAdapterOf(app);
    const [[globalMiddleware]] = adapter.use.mock.calls;
    const list = routeOf(adapter, '/shelves/');
    const find = routeOf(adapter, '/shelves/:id');
    const validate = prepareContextValidation(find.contextContract);

    expect(devtoolsBus.enabled).toBe(true);
    expect(
      await inRecord(async () => {
        await globalMiddleware.handle({}, next);

        for (const middleware of list.middlewares) {
          await middleware.handle({}, next);
        }

        await list.handler({ send: () => 'sent' });
      }),
    ).toEqual([
      'global-middleware Stamp.handle',
      'middleware Guard.handle',
      'middleware Throttle.handle',
      'controller ShelfController.list',
    ]);

    expect(
      await inRecord(() =>
        validate({ readContractInput: () => ({}), setValidated: () => {}, completeValidatedInput: () => {} }),
      ),
    ).toEqual(['validator ShelfContext']);
  });

  test('@Catch, then @Config.onError, in the error chain', async () => {
    await using app = await bootWithMockAdapter(shelfApp);
    const [[chain]] = mockAdapterOf(app).onError.mock.calls;

    expect(await inRecord(() => chain(new Gone(), {}))).toEqual(['catch ShelfErrors.gone']);
    expect(await inRecord(() => chain(new Error('other'), {}))).toEqual(['config-onError ShelfConfig.onError']);
  });

  test('@NotFound, then @Config.onNotFound, in the not-found chain', async () => {
    await using app = await bootWithMockAdapter(shelfApp);
    const [[chain]] = mockAdapterOf(app).onNotFound.mock.calls;

    expect(await inRecord(() => chain({}, { method: 'GET', path: '/nowhere' }))).toEqual([
      'not-found ShelfErrors.missing',
      'not-found ShelfConfig.onNotFound',
    ]);
  });

  // With no @ExceptionHandler, the config hooks go to the adapter unwrapped; devtools wraps them only when attached.
  test('the lone config onError / onNotFound hooks, wrapped only while devtools is attached', async () => {
    await using app = await bootWithMockAdapter([LoneHooksConfig]);
    const adapter = mockAdapterOf(app);
    const [[onError]] = adapter.onError.mock.calls;
    const [[onNotFound]] = adapter.onNotFound.mock.calls;

    expect(await inRecord(() => onError(new Error('boom'), {}))).toEqual(['config-onError LoneHooksConfig.onError']);
    expect(await inRecord(() => onNotFound({}, { method: 'GET', path: '/' }))).toEqual([
      'not-found LoneHooksConfig.onNotFound',
    ]);
    expect((await onError(new Error('boom'), {})).status).toBe(500);
  });
});

describe('DevtoolsBus without the console', () => {
  test('wraps nothing and allocates no storage', async () => {
    await using shelves = await bootWithMockAdapter(shelfApp);
    const adapter = mockAdapterOf(shelves);
    const [[globalMiddleware]] = adapter.use.mock.calls;
    const list = routeOf(adapter, '/shelves/');
    const find = routeOf(adapter, '/shelves/:id');

    expect(devtoolsBus.enabled).toBe(false);
    expect((devtoolsBus as any).storage).toBeUndefined();
    expect(globalMiddleware.handle.name).toBe('bound handle');
    expect(list.middlewares.map((middleware: any) => middleware.handle.name)).toEqual(['bound handle', 'bound handle']);
    expect(list.handler.name).toBe('bound list');
    expect(prepareContextValidation(find.contextContract).constructor.name).toBe('AsyncFunction');

    await using lone = await bootWithMockAdapter([LoneHooksConfig]);
    const loneAdapter = mockAdapterOf(lone);

    expect(loneAdapter.onError.mock.calls[0][0].name).toBe('bound onError');
    expect(loneAdapter.onNotFound.mock.calls[0][0].name).toBe('bound onNotFound');
  });

  test('a hook without an IPC channel leaves the bus off too', async () => {
    const restore = installDevtoolsHook(() => undefined, { ipc: false });

    try {
      await using app = await bootWithMockAdapter(shelfApp);

      expect(devtoolsBus.enabled).toBe(false);
      expect(routeOf(mockAdapterOf(app), '/shelves/').handler.name).toBe('bound list');
    } finally {
      restore();
    }
  });

  test('stopping the server that enabled the bus turns it off again', async () => {
    const restore = installDevtoolsHook(() => undefined);

    try {
      const app = await bootWithMockAdapter(shelfApp);

      expect(devtoolsBus.enabled).toBe(true);
      await app.stop();
      expect(devtoolsBus.enabled).toBe(false);
    } finally {
      restore();
    }
  });
});

class Spoiled extends Error {}

@EventService('shelf')
class ShelfEvents {
  @On('stocked')
  public stocked() {}

  @On('spoiled')
  public spoiled() {
    throw new Spoiled('spoiled');
  }
}

@MessageController('stock')
class StockHandler {
  @MessagePattern('count')
  public count() {
    return 3;
  }

  @MessagePattern('audit')
  public audit() {
    throw new Spoiled('audit failed');
  }

  @EventPattern('moved')
  public moved() {}
}

@Schedule({ cron: '0 5 * * *' })
class Restock implements AsenaSchedule {
  public async execute() {}
}

@ExceptionHandler()
class StockErrors {
  @Catch(Spoiled)
  public spoiled(_error: Spoiled, context: { scope: string }) {
    return context.scope === 'microservice' ? { recovered: true } : undefined;
  }
}

@Config()
class StockConfig {
  public transport() {
    return { microservice: new InMemoryTransport() };
  }
}

describe('DevtoolsBus dispatch records (@On, messages, @Schedule)', () => {
  test('frames each dispatch as its own record through the real dispatch path', async () => {
    let context!: DevtoolsServerContext;
    const restore = installDevtoolsHook((handed) => {
      context = handed;
    });
    const records: DevtoolsRequestRecord[] = [];
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const server = await AsenaServerFactory.create({
        headless: true,
        logger: silentLogger,
        components: [ShelfEvents, StockHandler, Restock, StockErrors, StockConfig],
        shutdown: { signals: false },
      });

      await server.start();
      context.bus.subscribe((record) => records.push(record));

      expect(context.events.emit('shelf.stocked')).toBe(true);
      expect(context.events.emit('shelf.spoiled')).toBe(true);
      expect(await context.ulak.send('stock.count', {})).toBe(3);
      expect(await context.ulak.send('stock.audit', {})).toEqual({ recovered: true });
      await context.ulak.emit('stock.moved', {});
      await context.cron.runNow('Restock');
      await Bun.sleep(5);
      await server.stop();
    } finally {
      consoleError.mockRestore();
      restore();
    }

    const summary = records.map(({ method, path, status, steps, answeredBy }) => ({
      method,
      path,
      status,
      steps: steps.map(({ kind, name }) => `${kind} ${name}`),
      answeredBy: answeredBy.name,
    }));

    expect(summary).toContainEqual({
      method: '@On',
      path: 'shelf.stocked',
      status: 200,
      steps: ['controller ShelfEvents.stocked'],
      answeredBy: 'ShelfEvents.stocked',
    });
    // Observe-only: the @Catch runs, the failure stands.
    expect(summary).toContainEqual({
      method: '@On',
      path: 'shelf.spoiled',
      status: 500,
      steps: ['controller ShelfEvents.spoiled', 'catch StockErrors.spoiled'],
      answeredBy: 'ShelfEvents.spoiled',
    });
    expect(summary).toContainEqual({
      method: '@MessagePattern',
      path: 'stock.count',
      status: 200,
      steps: ['controller StockHandler.count'],
      answeredBy: 'StockHandler.count',
    });
    // The @Catch's return value became the reply, so it answered.
    expect(summary).toContainEqual({
      method: '@MessagePattern',
      path: 'stock.audit',
      status: 200,
      steps: ['controller StockHandler.audit', 'catch StockErrors.spoiled'],
      answeredBy: 'StockErrors.spoiled',
    });
    expect(summary).toContainEqual({
      method: '@EventPattern',
      path: 'stock.moved',
      status: 200,
      steps: ['controller StockHandler.moved'],
      answeredBy: 'StockHandler.moved',
    });
    expect(summary).toContainEqual({
      method: '@Schedule',
      path: 'Restock',
      status: 200,
      steps: ['controller Restock.execute'],
      answeredBy: 'Restock.execute',
    });
    expect(summary).toHaveLength(6);
  });
});
