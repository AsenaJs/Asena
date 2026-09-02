import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../../lib/server';
import { Controller, Middleware } from '../../../lib/server/decorators';
import { Get } from '../../../lib/server/web/decorators';
import type { AsenaContext } from '../../../lib/adapter';
import { AsenaMiddlewareService } from '../../../lib/server/web/middleware';
import { createMockAdapter } from '../../utils/createMockContext';

// Controller-level middlewares used to be registered as a `${routePath}/*` global pattern, which
// is a path scope and not a controller scope: `/` produced `//*` and matched nothing, `/admin/`
// produced `/admin//*` and matched nothing, and `/api/*` reached an unrelated `/api/open`
// controller. Every assertion below is on counters keyed by guard and handler name - the mock's
// testRequest falls back to any route with the same method, so a status could not tell the two
// apart.

let guardCalls = 0;
let handled: string[] = [];
let order: string[] = [];

@Middleware()
class Guard extends AsenaMiddlewareService {
  public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
    guardCalls++;
    order.push('guard');
    await next();
  }
}

@Middleware()
class DenyGuard extends AsenaMiddlewareService {
  public async handle(): Promise<void> {
    guardCalls++;
  }
}

@Middleware()
class RouteMw extends AsenaMiddlewareService {
  public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
    order.push('route');
    await next();
  }
}

@Controller({ path: '/', middlewares: [Guard] })
class RootGuarded {
  @Get('/secret')
  public secret(context: AsenaContext<any, any>) {
    handled.push('secret');

    return context.send('secret');
  }

  @Get('/')
  public root(context: AsenaContext<any, any>) {
    handled.push('root');

    return context.send('root');
  }
}

@Controller({ path: '', middlewares: [Guard] })
class EmptyGuarded {
  @Get('/empty-secret')
  public emptySecret(context: AsenaContext<any, any>) {
    handled.push('empty-secret');

    return context.send('empty-secret');
  }
}

@Controller({ path: '/admin/', middlewares: [Guard] })
class AdminSlashGuarded {
  @Get('/secret')
  public secret(context: AsenaContext<any, any>) {
    handled.push('admin-secret');

    return context.send('admin-secret');
  }

  @Get('/')
  public index(context: AsenaContext<any, any>) {
    handled.push('admin-root');

    return context.send('admin-root');
  }
}

@Controller({ path: '/api', middlewares: [Guard] })
class ApiGuarded {
  @Get('/secret')
  public secret(context: AsenaContext<any, any>) {
    handled.push('api-secret');

    return context.send('api-secret');
  }
}

@Controller('/api/open')
class ApiOpen {
  @Get('/x')
  public x(context: AsenaContext<any, any>) {
    handled.push('open');

    return context.send('open');
  }
}

@Controller({ path: '/', middlewares: [DenyGuard] })
class RootDenied {
  @Get('/blocked')
  public blocked(context: AsenaContext<any, any>) {
    handled.push('blocked');

    return context.send('blocked');
  }
}

@Controller('/')
class RootRouteLevel {
  @Get({ path: '/route-guarded', middlewares: [Guard] })
  public routeGuarded(context: AsenaContext<any, any>) {
    handled.push('route-guarded');

    return context.send('route-guarded');
  }
}

@Controller({ path: '/', middlewares: [Guard] })
class RootBoth {
  @Get({ path: '/both', middlewares: [RouteMw] })
  public both(context: AsenaContext<any, any>) {
    order.push('handler');
    handled.push('both');

    return context.send('both');
  }
}

describe('controller middlewares scope to their own routes', () => {
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(() => {
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
    guardCalls = 0;
    handled = [];
    order = [];
  });

  const boot = async (components: any[]): Promise<void> => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components,
    });

    await server.start();
  };

  test('a controller mounted at / guards its sub-route', async () => {
    await boot([Guard, RootGuarded]);

    await mockAdapter.testRequest('GET', '/secret');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['secret']);
  });

  test('a controller mounted at / guards its own root route', async () => {
    await boot([Guard, RootGuarded]);

    await mockAdapter.testRequest('GET', '/');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['root']);
  });

  test('a controller declared with an empty path guards its routes', async () => {
    await boot([Guard, EmptyGuarded]);

    await mockAdapter.testRequest('GET', '/empty-secret');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['empty-secret']);
  });

  test('a controller prefix with a trailing slash guards its sub-route', async () => {
    await boot([Guard, AdminSlashGuarded]);

    await mockAdapter.testRequest('GET', '/admin/secret');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['admin-secret']);
  });

  test('a controller prefix with a trailing slash guards its root route, spelled either way', async () => {
    await boot([Guard, AdminSlashGuarded]);

    await mockAdapter.testRequest('GET', '/admin');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['admin-root']);

    await mockAdapter.testRequest('GET', '/admin/');

    expect(guardCalls).toBe(2);
    expect(handled).toEqual(['admin-root', 'admin-root']);
  });

  test('a controller mounted at /api guards its own route', async () => {
    await boot([Guard, ApiGuarded]);

    await mockAdapter.testRequest('GET', '/api/secret');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['api-secret']);
  });

  test('a guarded /api controller does not guard an unrelated /api/open controller', async () => {
    await boot([Guard, ApiGuarded, ApiOpen]);

    await mockAdapter.testRequest('GET', '/api/open/x');

    // The prefix pattern was a path scope, so a second controller mounted deeper inherited the
    // first one's guard - an authorization decision its author never wrote.
    expect(guardCalls).toBe(0);
    expect(handled).toEqual(['open']);
  });

  test('a controller middleware that does not call next stops the handler', async () => {
    await boot([DenyGuard, RootDenied]);

    await mockAdapter.testRequest('GET', '/blocked');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual([]);
  });

  test('a route-level middleware on a / controller still runs', async () => {
    await boot([Guard, RootRouteLevel]);

    await mockAdapter.testRequest('GET', '/route-guarded');

    expect(guardCalls).toBe(1);
    expect(handled).toEqual(['route-guarded']);
  });

  test('controller middlewares run before route middlewares', async () => {
    await boot([Guard, RouteMw, RootBoth]);

    await mockAdapter.testRequest('GET', '/both');

    expect(order).toEqual(['guard', 'route', 'handler']);
  });

  test('no controller middleware is registered as a global pattern', async () => {
    await boot([Guard, RootGuarded]);

    expect(mockAdapter.use).not.toHaveBeenCalled();
  });
});
