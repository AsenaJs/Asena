import { describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { Service } from '../../lib/server/decorators';
import { Implements, Inject, Strategy } from '../../lib/ioc/component';
import { createMockAdapter } from '../utils/createMockContext';

describe('class-referenced strategies and injections', () => {
  test('@Strategy(UndecoratedClass) injects every @Implements of that class name', async () => {
    class Greeter {}

    @Service()
    @Implements('Greeter')
    class EnglishGreeter {}

    @Service()
    @Implements('Greeter')
    class FrenchGreeter {}

    @Service()
    class Host {
      @Strategy(Greeter)
      public greeters!: unknown[];
    }

    await using app = await createTestApp({
      adapter: createMockAdapter().adapter as any,
      logger: silentLogger,
      components: [EnglishGreeter, FrenchGreeter, Host],
    });

    const host = await app.server.resolve<Host>('Host');

    expect(host.greeters).toHaveLength(2);
    expect(host.greeters.map((greeter) => greeter?.constructor)).toEqual(
      expect.arrayContaining([EnglishGreeter, FrenchGreeter]),
    );
  });

  test('@Inject(UndecoratedClass) fails at boot naming the class, not undefined', async () => {
    class Plain {}

    @Service()
    class Host {
      @Inject(Plain)
      public plain!: Plain;
    }

    const boot = AsenaServerFactory.create({
      adapter: createMockAdapter().adapter as any,
      logger: silentLogger,
      components: [Host],
      shutdown: { signals: false },
      keepAlive: false,
    });

    await expect(boot).rejects.toThrow("'Plain' is not registered (injected into Host.plain)");
  });
});
