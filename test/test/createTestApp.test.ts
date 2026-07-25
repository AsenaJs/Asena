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

    expect(await app.resolve('UserService')).toBe(double);
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
