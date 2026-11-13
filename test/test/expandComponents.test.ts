import { describe, expect, test } from 'bun:test';
import { expandComponents } from '../../lib/test/harness/expandComponents';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { Service } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';
import { createMockAdapter } from '../utils/createMockContext';

describe('expandComponents', () => {
  test('a class-injected dependency named after its dependent is matched by its real name', () => {
    class Dependency {}

    class Dependent {
      @Inject(Dependency)
      public dependency!: Dependency;
    }

    // Named only after Dependent is decorated, so @Inject stored the class name instead.
    Service('RealDependency')(Dependency);

    expect(expandComponents([Dependent], { RealDependency: {} })).toEqual([Dependent]);
  });

  test('the container injects the override for a class-injected dependency named after its dependent', async () => {
    class Dependency {}

    class Dependent {
      @Inject(Dependency)
      public dependency!: Dependency;
    }

    Service()(Dependent);
    Service('RealDependency')(Dependency);

    const double = {};

    await using app = await createTestApp({
      adapter: createMockAdapter().adapter as any,
      logger: silentLogger,
      components: [Dependent],
      overrides: { RealDependency: double },
    });

    expect((await app.server.resolve<Dependent>('Dependent')).dependency).toBe(double as Dependency);
  });
});
