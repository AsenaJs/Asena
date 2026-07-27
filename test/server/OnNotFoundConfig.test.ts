import { describe, expect, mock, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Config, Controller, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { Inject } from '../../lib/ioc/component';
import type { AsenaContext, NotFoundRequest } from '../../lib/adapter';
import { ASENA_CONFIG_FUNCTIONS } from '../../lib/server/config';
import { createMockAdapter } from '../utils/createMockContext';

@Service()
class NoopService {}

@Controller('/api')
class ApiController {
  @Inject(NoopService)
  private noop: NoopService;

  @Get('/ping')
  public ping(context: AsenaContext<any, any>) {
    return context.send('pong');
  }
}

const createLogger = () => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  profile: mock(() => {}),
});

const bootWith = async (ConfigClass: any, adapter: any, logger: any) => {
  const server = await AsenaServerFactory.create({
    adapter,
    logger: logger as any,
    port: 3000,
    components: [NoopService, ApiController, ConfigClass],
  });

  await server.start();

  return server;
};

describe('onNotFound config hook', () => {
  test('is dispatched to the adapter', async () => {
    const { adapter } = createMockAdapter();
    const onNotFound = mock(() => {});

    (adapter as any).onNotFound = onNotFound;

    @Config()
    class AppConfig {
      public onNotFound(context: AsenaContext<any, any>, request: NotFoundRequest) {
        return context.send({ path: request.path }, 404);
      }
    }

    await bootWith(AppConfig, adapter, createLogger());

    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  test('is bound to the config instance, so it can use injected dependencies', async () => {
    const { adapter } = createMockAdapter();

    let captured: any;

    (adapter as any).onNotFound = mock((handler: any) => {
      captured = handler;
    });

    @Config()
    class AppConfig {
      private envelope = { code: 'NOT_FOUND' };

      public onNotFound(context: AsenaContext<any, any>) {
        // `this` must be the config instance - the dispatcher binds it before handing it over
        return context.send(this.envelope, 404);
      }
    }

    await bootWith(AppConfig, adapter, createLogger());

    const send = mock((data: any) => data);

    captured({ send } as any, { path: '/missing', method: 'GET' });

    expect(send).toHaveBeenCalledWith({ code: 'NOT_FOUND' }, 404);
  });

  test('warns instead of silently doing nothing when the adapter has no onNotFound', async () => {
    const { adapter } = createMockAdapter();
    const logger = createLogger();

    // An adapter written before the hook existed. The method is optional on AsenaAdapter so
    // such an adapter still compiles - the failure mode to avoid is a declared handler that
    // never runs and never says so.
    delete (adapter as any).onNotFound;

    @Config()
    class AppConfig {
      public onNotFound(context: AsenaContext<any, any>) {
        return context.send({ error: 'Not Found' }, 404);
      }
    }

    await bootWith(AppConfig, adapter, logger);

    const warning = logger.warn.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('onNotFound'));

    expect(warning).toContain('does not support it');
  });

  test('is not called when the config does not declare it', async () => {
    const { adapter } = createMockAdapter();
    const onNotFound = mock(() => {});

    (adapter as any).onNotFound = onNotFound;
    (adapter as any).onError = mock(() => {});

    @Config()
    class AppConfig {
      public onError(context: AsenaContext<any, any>) {
        return context.send({ error: 'boom' }, 500);
      }
    }

    await bootWith(AppConfig, adapter, createLogger());

    expect(onNotFound).not.toHaveBeenCalled();
  });

  test('is covered by the config misuse allowlist', () => {
    // ASENA_CONFIG_FUNCTIONS doubles as the allowlist for warnOnIgnoredConfigMembers. A hook
    // missing from it is a hook whose misuse the startup check cannot report.
    expect(ASENA_CONFIG_FUNCTIONS).toContain('onNotFound');
  });

  test('warns when onNotFound is a property rather than a method', async () => {
    const { adapter } = createMockAdapter();
    const logger = createLogger();

    (adapter as any).onNotFound = mock(() => {});

    @Config()
    class AppConfig {
      // A common shape mistake - the framework reads hooks reflectively, so this never runs
      public onNotFound = 'not a method';
    }

    await bootWith(AppConfig, adapter, logger);

    const warning = logger.warn.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.startsWith('Config ') && message.includes('onNotFound'));

    expect(warning).toContain('not a method');
  });
});
