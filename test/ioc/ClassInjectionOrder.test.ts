import { describe, expect, test } from 'bun:test';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { Service } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';
import { createMockAdapter } from '../utils/createMockContext';

class Dependency {}

class Dependent {
  @Inject(Dependency)
  private dependency!: Dependency;

  public get injected() {
    return this.dependency;
  }
}

Service('RealDependency')(Dependency);
Service()(Dependent);

const boot = (components: any[]) =>
  createTestApp({ adapter: createMockAdapter().adapter as any, logger: silentLogger, components });

describe('class-injected dependency at boot', () => {
  test('boots when the dependency is listed before its dependent', async () => {
    await using app = await boot([Dependency, Dependent]);
    const dependent = await app.server.resolve<Dependent>('Dependent');

    expect(dependent.injected).toBeInstanceOf(Dependency);
  });

  test('boots when the dependency is listed after its dependent', async () => {
    await using app = await boot([Dependent, Dependency]);
    const dependent = await app.server.resolve<Dependent>('Dependent');

    expect(dependent.injected).toBeInstanceOf(Dependency);
  });
});
