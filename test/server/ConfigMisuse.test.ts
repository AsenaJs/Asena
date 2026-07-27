import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Config } from '../../lib/server/decorators';
import type { AsenaConfig } from '../../lib/server/config';
import type { AsenaServeOptions } from '../../lib/adapter';

class DummyMiddleware {}

// The failure mode the compiler cannot catch: an extra property on a @Config subclass is
// always legal, but the framework only ever calls globalMiddlewares().
@Config('MiddlewaresPropertyConfig')
class MiddlewaresPropertyConfig {
  public middlewares = [DummyMiddleware];
}

@Config('ValueHookConfig')
class ValueHookConfig {
  public onError = { status: 500 };
}

@Config('CorrectConfig')
class CorrectConfig implements AsenaConfig {
  public serveOptions(): AsenaServeOptions {
    return {};
  }

  public globalMiddlewares() {
    return [];
  }
}

describe('AsenaServer config misuse warnings', () => {
  let mockLogger: any;
  let mockAdapter: any;

  // Startup emits unrelated warnings (e.g. a missing asena-config file), so narrow to the
  // misuse report, which always names the offending config member first.
  const warnings = (): string[] =>
    mockLogger.warn.mock.calls.map((call: any[]) => call[0]).filter((message: string) => message.startsWith('Config '));

  beforeEach(() => {
    mockLogger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    };

    mockAdapter = {
      name: 'MockAdapter',
      options: {},
      setPort: mock(() => {}),
      start: mock(async () => {}),
      registerRoute: mock(() => {}),
      registerWebsocketRoute: mock(() => {}),
      prepareMiddlewares: mock(() => []),
      prepareHandler: mock(() => () => {}),
      prepareValidator: mock(() => {}),
      use: mock(() => {}),
      serveOptions: mock(async () => {}),
      onError: mock(() => {}),
      websocketAdapter: {
        registerWebSocket: mock(() => {}),
        startWebsocket: mock(() => {}),
      },
    };
  });

  const startWith = async (config: any) => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [config],
    });

    await server.start();
  };

  test('warns when middlewares is declared as a property instead of globalMiddlewares()', async () => {
    await startWith(MiddlewaresPropertyConfig);

    expect(
      warnings().some((message) => message.includes("'middlewares'") && message.includes('globalMiddlewares()')),
    ).toBe(true);
  });

  test('warns when a hook is declared as a value instead of a method', async () => {
    await startWith(ValueHookConfig);

    expect(warnings().some((message) => message.includes("'onError' is a object"))).toBe(true);
    expect(mockAdapter.onError).not.toHaveBeenCalled();
  });

  test('stays silent for a correctly shaped config', async () => {
    await startWith(CorrectConfig);

    expect(warnings()).toEqual([]);
  });
});
