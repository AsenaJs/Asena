import { describe, expect, test } from 'bun:test';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { discoverInjectedFieldsFromClass } from '../../lib/test/metadata/discovery';
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

class Unnamed {}

class UnnamedHolder {
  @Inject(Unnamed)
  private unnamed!: Unnamed;

  public get injected() {
    return this.unnamed;
  }
}

Service('')(Unnamed);
Service()(UnnamedHolder);

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

  test('resolves a dependency whose component name is empty under its class name', async () => {
    await using app = await boot([Unnamed, UnnamedHolder]);
    const holder = await app.server.resolve<UnnamedHolder>('UnnamedHolder');

    expect(holder.injected).toBeInstanceOf(Unnamed);
    expect(discoverInjectedFieldsFromClass(UnnamedHolder).map((field) => field.serviceName)).toEqual(['Unnamed']);
  });
});
