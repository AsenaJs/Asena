import { describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Service } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * `@Inject(Class)` is resolved by the dependency's registered name. The boot order must use the
 * same name as the container does, or a dependency listed after its dependent is looked up under
 * the name it was decorated with and reported as not registered.
 */
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

const boot = async (components: any[]) => {
  const { adapter } = createMockAdapter();

  const server = await AsenaServerFactory.create({
    adapter: adapter as any,
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      profile: () => {},
      debug: () => {},
    } as any,
    port: 3000,
    components,
  });

  await server.start();

  return server;
};

describe('class-injected dependency at boot', () => {
  test('boots when the dependency is listed before its dependent', async () => {
    const server = await boot([Dependency, Dependent]);
    const dependent = await server.resolve<Dependent>('Dependent');

    expect(dependent.injected).toBeInstanceOf(Dependency);
  });

  test('boots when the dependency is listed after its dependent', async () => {
    const server = await boot([Dependent, Dependency]);
    const dependent = await server.resolve<Dependent>('Dependent');

    expect(dependent.injected).toBeInstanceOf(Dependency);
  });
});
