import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Config, Service } from '../../lib/server/decorators';
import { OnStart, OnStop, Scope } from '../../lib/ioc/component';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';

const warnings: string[] = [];

const capturingLogger = {
  ...silentLogger,
  warn: (message: string) => {
    warnings.push(message);
  },
};

const createServer = (components: any[]) =>
  AsenaServerFactory.create({
    adapter: createMockAdapter().adapter as any,
    logger: capturingLogger as any,
    components,
    shutdown: { signals: false },
    keepAlive: false,
  });

describe('lifecycle warnings', () => {
  beforeEach(() => {
    warnings.length = 0;
  });

  test('a transient with @OnStop is called out at boot', async () => {
    @Service({ scope: Scope.PROTOTYPE })
    class PerResolveWorker {
      @OnStop()
      public async close() {}
    }

    await createServer([PerResolveWorker]);

    const warning = warnings.find((message) => message.includes('PerResolveWorker'));

    expect(warning).toContain('transient');
    expect(warning).toContain('@OnStop');
    expect(warning).toContain('never');
  });

  test('a singleton with @OnStop is not', async () => {
    @Service()
    class SingletonWorker {
      @OnStop()
      public async close() {}
    }

    await createServer([SingletonWorker]);

    expect(warnings.filter((message) => message.includes('SingletonWorker'))).toEqual([]);
  });

  test('a @Config with a start hook is not warned about, because it works', async () => {
    // There used to be a warning here, and it was right at the time: start hooks ran after
    // application setup, so a @Config's own hook fired after its config hooks had been read.
    // Moving the hooks ahead of setup made the warning false - the hook now runs first and can
    // prepare what transport() or globalMiddlewares() goes on to use.
    const prepared: string[] = [];

    @Config()
    class AppConfig {
      @OnStart()
      public prepare() {
        prepared.push('config:start');
      }

      public globalMiddlewares() {
        prepared.push(`config:middlewares(${prepared.includes('config:start') ? 'prepared' : 'cold'})`);

        return [];
      }
    }

    const server = await createServer([AppConfig]);

    await server.start();

    expect(warnings.filter((message) => message.includes('AppConfig'))).toEqual([]);
    expect(prepared).toEqual(['config:start', 'config:middlewares(prepared)']);

    await server.stop();
  });
});
