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

  test('a @Config with a start hook is called out', async () => {
    @Config()
    class AppConfig {
      @OnStart()
      public prepare() {}
    }

    const server = await createServer([AppConfig]);

    await server.start();

    const warning = warnings.find((message) => message.includes('AppConfig'));

    expect(warning).toContain('start hook');
    expect(warning).toContain('application setup');

    await server.stop();
  });

  test('a @Config without one is not', async () => {
    @Config()
    class QuietConfig {}

    const server = await createServer([QuietConfig]);

    await server.start();

    expect(warnings.filter((message) => message.includes('QuietConfig'))).toEqual([]);

    await server.stop();
  });
});
