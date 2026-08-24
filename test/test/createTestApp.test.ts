import { describe, expect, mock, test } from 'bun:test';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { Controller, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { Inject } from '../../lib/ioc/component';
import type { AsenaContext } from '../../lib/adapter';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * Container wiring, lifecycle and URL construction for the harness.
 *
 * The mock adapter never opens a socket, so real request/response behaviour is covered by
 * the e2e apps against the actual hono and ergenecore adapters.
 */
@Service()
class UserService {
  public async findById(id: string) {
    return { id, name: 'real user' };
  }
}

@Service()
class ReportService {
  @Inject(UserService)
  private userService: UserService;

  public async describe(id: string) {
    const user = await this.userService.findById(id);

    return `report for ${user.name}`;
  }
}

@Controller('/users')
class UserController {
  @Inject(UserService)
  private userService: UserService;

  @Get('/:id')
  public async find(context: AsenaContext<any, any>) {
    return context.send(await this.userService.findById('1'));
  }
}

@Service()
class LeafService {
  public async leaf() {
    return 'leaf';
  }
}

@Service()
class BranchService {
  @Inject(LeafService)
  private leafService: LeafService;

  public async branch() {
    return `branch:${await this.leafService.leaf()}`;
  }
}

@Controller('/closure')
class ClosureController {
  @Inject(BranchService)
  private branchService: BranchService;

  @Get('/branch')
  public async branch(context: AsenaContext<any, any>) {
    return context.send(await this.branchService.branch());
  }
}

@Controller('/broken')
class BrokenController {
  @Inject('GhostService')
  private ghostService: any;

  @Get('/')
  public async root(context: AsenaContext<any, any>) {
    return context.send('ok');
  }
}

// Deliberately undecorated: @Inject(PlainUndecorated) must be reported, not silently followed
class PlainUndecorated {
  public ping() {
    return 'pong';
  }
}

@Service()
class WantsUndecorated {
  @Inject(PlainUndecorated)
  private dependency: PlainUndecorated;
}

const boot = (overrides?: Record<string, object>) =>
  createTestApp({
    adapter: createMockAdapter().adapter as any,
    logger: silentLogger,
    components: [UserService, ReportService, UserController],
    overrides,
  });

describe('createTestApp', () => {
  test('should boot the app and expose the container', async () => {
    await using app = await boot();

    expect(app.server).toBeDefined();
    expect(app.container).toBeDefined();
    expect(app.container.has('UserService')).toBe(true);
  });

  test('should resolve registered components', async () => {
    await using app = await boot();

    const service = await app.resolve<UserService>('UserService');

    expect(await service.findById('7')).toEqual({ id: '7', name: 'real user' });
  });

  test('should replace a service with an override', async () => {
    const double = { findById: mock(async () => ({ id: 'mock', name: 'double' })) };

    await using app = await boot({ UserService: double });

    expect(await app.resolve<typeof double>('UserService')).toBe(double);
  });

  test('should hand the override to dependents that inject it', async () => {
    const double = { findById: mock(async () => ({ id: 'mock', name: 'double' })) };

    await using app = await boot({ UserService: double });

    const report = await app.resolve<ReportService>('ReportService');

    expect(await report.describe('1')).toBe('report for double');
    expect(double.findById).toHaveBeenCalledWith('1');
  });

  test('should build websocket urls for the bound port', async () => {
    await using app = await boot();

    expect(app.wsUrl('/ws/chat')).toBe(`ws://localhost:${app.port}/ws/chat`);
    expect(app.socketPath).toBeUndefined();
  });

  test('should build request urls from the base url', async () => {
    await using app = await boot();

    expect(app.baseUrl).toBe(`http://localhost:${app.port}`);
  });

  test('should make stop idempotent', async () => {
    const app = await boot();
    const stopSpy = mock(app.server.stop.bind(app.server));

    app.server.stop = stopSpy as any;

    await app.stop();
    await app.stop();
    await app.stop();

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  describe('dependency closure', () => {
    test('should register the transitive injection closure for real', async () => {
      const { adapter } = createMockAdapter();

      await using app = await createTestApp({
        adapter: adapter as any,
        logger: silentLogger,
        components: [ClosureController],
      });

      expect(app.container.has('BranchService')).toBe(true);
      expect(app.container.has('LeafService')).toBe(true);

      const branch = await app.resolve<BranchService>('BranchService');

      expect(await branch.branch()).toBe('branch:leaf');

      // A request that travels controller -> branch -> leaf through the real wiring
      const response = await adapter.testRequest('get', '/closure/branch');

      expect(response.body).toBe('branch:leaf');
    });

    test('should reject before boot when a name-injected dependency is missing', async () => {
      const { adapter } = createMockAdapter();

      await expect(
        createTestApp({
          adapter: adapter as any,
          logger: silentLogger,
          components: [BrokenController],
        }),
      ).rejects.toThrow(
        /createTestApp: missing dependencies:\nBrokenController\.ghostService injects 'GhostService', which is not in components or overrides/,
      );

      expect(adapter.start).not.toHaveBeenCalled();
    });

    test('should not register a dependency for real when its name is overridden', async () => {
      const double = { leaf: mock(async () => 'mocked leaf') };

      await using app = await createTestApp({
        adapter: createMockAdapter().adapter as any,
        logger: silentLogger,
        components: [BranchService],
        overrides: { LeafService: double },
      });

      expect(await app.resolve<typeof double>('LeafService')).toBe(double);

      const branch = await app.resolve<BranchService>('BranchService');

      expect(await branch.branch()).toBe('branch:mocked leaf');
    });

    test('should not double-register a class listed twice', async () => {
      await using app = await createTestApp({
        adapter: createMockAdapter().adapter as any,
        logger: silentLogger,
        components: [LeafService, LeafService, BranchService],
      });

      const resolved = await app.resolve<LeafService>('LeafService');

      expect(Array.isArray(resolved)).toBe(false);
      expect(resolved.leaf()).resolves.toBe('leaf');
    });

    test('should report a class injection whose target is not a decorated component', async () => {
      await expect(
        createTestApp({
          adapter: createMockAdapter().adapter as any,
          logger: silentLogger,
          components: [WantsUndecorated],
        }),
      ).rejects.toThrow('WantsUndecorated.dependency injects PlainUndecorated, which is not a decorated component');
    });
  });

  // createTestApp forwards `components` straight to AsenaServerFactory, so it is the harness
  // face of the explicit-components path - the one that used to bypass the component-identity
  // check entirely, because every inheritance fixture in the suite went through the file scan.
  describe('inheritance through the explicit components path', () => {
    test('should register routes a controller inherits from its base class', async () => {
      abstract class HealthBase {
        @Get('/live')
        public live(context: AsenaContext<any, any>) {
          return context.send({ probe: 'live' });
        }
      }

      @Controller('/harness')
      class HarnessController extends HealthBase {
        @Get('/own')
        public own(context: AsenaContext<any, any>) {
          return context.send({ probe: 'own' });
        }
      }

      const { adapter } = createMockAdapter();

      await using app = await createTestApp({
        adapter: adapter as any,
        logger: silentLogger,
        components: [HarnessController],
      });

      const registered = adapter.registerRoute.mock.calls
        .map(([route]: any[]) => `${route.method} ${route.path}`)
        .sort();

      // The harness has to report exactly what the running server registers - the whole point
      // of the merge being applied in one place.
      expect(registered).toEqual(['get /harness/live', 'get /harness/own']);
      expect(app.container.has('HarnessController')).toBe(true);
    });

    test('should not register an undecorated subclass under its base class name', async () => {
      @Service('BaseAudit')
      class BaseAudit {
        public record() {
          return 'base';
        }
      }

      // The decorator was forgotten. Passed explicitly rather than found by the scan.
      class TenantAudit extends BaseAudit {
        public override record() {
          return 'tenant';
        }
      }

      await using app = await createTestApp({
        adapter: createMockAdapter().adapter as any,
        logger: silentLogger,
        components: [BaseAudit, TenantAudit],
      });

      const resolved: any = await app.resolve('BaseAudit');

      // Under the chained identity read both classes registered as 'BaseAudit', the container
      // promoted the entry to an array, and `audit.record()` threw far from the cause.
      expect(Array.isArray(resolved)).toBe(false);
      // Identity, not membership: a TenantAudit instance is also `instanceof BaseAudit`, so the
      // last-write-wins form of the bug reads identical to the correct answer.
      expect(resolved.constructor).toBe(BaseAudit);
      expect(resolved.record()).toBe('base');
    });
  });

  test('should stop the server through await using', async () => {
    let stopped = false;

    {
      await using app = await boot();

      const original = app.server.stop.bind(app.server);

      app.server.stop = (async (...args: any[]) => {
        stopped = true;

        return await original(...args);
      }) as any;

      expect(stopped).toBe(false);
    }

    expect(stopped).toBe(true);
  });
});
