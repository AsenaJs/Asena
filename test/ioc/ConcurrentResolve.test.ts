import { describe, expect, test } from 'bun:test';
import type { ComponentPostProcessor } from '../../lib/ioc';
import { CircularDependencyError, Container } from '../../lib/ioc';
import { Service } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';

@Service()
class Leaf {
  public readonly id = Math.random();
}

@Service()
class UserService {
  @Inject('Leaf')
  public leaf: Leaf;
}

@Service()
class AccountService {
  @Inject('Leaf')
  public leaf: Leaf;
}

@Service()
class ReportService {
  @Inject('Leaf')
  public leaf: Leaf;
}

@Service()
class ToolImpl {}

@Service()
class CycleA {
  @Inject('CycleB')
  public b: unknown;
}

@Service()
class CycleB {
  @Inject('CycleA')
  public a: unknown;
}

@Service()
class Unrelated {}

@Service()
class PoisonInner {}

@Service()
class PoisonOuter {
  @Inject('PoisonInner')
  public inner: PoisonInner;
}

class FailOnceFor implements ComponentPostProcessor {
  private failed = false;

  public constructor(private readonly target: unknown) {}

  public async postProcess<T>(instance: T, Class: unknown): Promise<T> {
    if (Class === this.target && !this.failed) {
      this.failed = true;
      throw new Error('construction failed once');
    }

    return instance;
  }
}

describe('concurrent resolve()', () => {
  test('two concurrent resolve() of the same singleton both resolve to that instance', async () => {
    const container = new Container();

    await container.register('Leaf', Leaf, true);
    await container.register('UserService', UserService, true);

    const [first, second] = await Promise.all([
      container.resolve<UserService>('UserService'),
      container.resolve<UserService>('UserService'),
    ]);

    expect(first).toBeInstanceOf(UserService);
    expect(second).toBe(first);
  });

  test('two concurrent resolve() of distinct keys sharing a dependency both resolve', async () => {
    const container = new Container();

    await container.register('Leaf', Leaf, true);
    await container.register('UserService', UserService, false);
    await container.register('AccountService', AccountService, false);

    const [user, account] = await Promise.all([
      container.resolve<UserService>('UserService'),
      container.resolve<AccountService>('AccountService'),
    ]);

    expect(user).toBeInstanceOf(UserService);
    expect(account).toBeInstanceOf(AccountService);
    expect((user as UserService).leaf).toBe((account as AccountService).leaf);
  });

  test('three concurrent resolve() of a non-singleton key each build their own instance', async () => {
    const container = new Container();

    await container.register('Leaf', Leaf, true);
    await container.register('ReportService', ReportService, false);

    const results = await Promise.all([
      container.resolve<ReportService>('ReportService'),
      container.resolve<ReportService>('ReportService'),
      container.resolve<ReportService>('ReportService'),
    ]);

    expect(new Set(results).size).toBe(3);
    results.forEach((result) => expect(result).toBeInstanceOf(ReportService));
  });

  test('two concurrent resolveStrategy() of the same key both resolve', async () => {
    const container = new Container();

    await container.register('ToolIface', ToolImpl, true);

    const [first, second] = await Promise.all([
      container.resolveStrategy<ToolImpl>('ToolIface'),
      container.resolveStrategy<ToolImpl>('ToolIface'),
    ]);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toBe(first[0]);
  });

  test('a real cycle is still reported with its full chain while an unrelated resolve is in flight', async () => {
    const container = new Container();

    await container.register('CycleA', CycleA, false);
    await container.register('CycleB', CycleB, false);
    await container.register('Unrelated', Unrelated, false);

    const [unrelated, cycle] = await Promise.allSettled([
      container.resolve<Unrelated>('Unrelated'),
      container.resolve<CycleA>('CycleA'),
    ]);

    expect(unrelated.status).toBe('fulfilled');
    expect(cycle.status).toBe('rejected');
    expect((cycle as PromiseRejectedResult).reason).toBeInstanceOf(CircularDependencyError);
    expect(((cycle as PromiseRejectedResult).reason as Error).message).toBe(
      'Circular dependency detected: CycleA -> CycleB -> CycleA',
    );
  });

  test('a resolve that fails midway through its chain does not poison the next resolve of the same key', async () => {
    const container = new Container();

    container.registerPostProcessor(new FailOnceFor(PoisonInner));
    await container.register('PoisonInner', PoisonInner, false);
    await container.register('PoisonOuter', PoisonOuter, false);

    await expect(container.resolve('PoisonOuter')).rejects.toThrow('construction failed once');

    const resolved = await container.resolve<PoisonOuter>('PoisonOuter');

    if (!(resolved instanceof PoisonOuter)) {
      throw new Error('expected a single PoisonOuter');
    }

    expect(resolved.inner).toBeInstanceOf(PoisonInner);
  });
});
