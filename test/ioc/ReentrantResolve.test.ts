import { describe, expect, test } from 'bun:test';
import { CircularDependencyError, Container } from '../../lib/ioc';
import { OnStart } from '../../lib/ioc/component';

const REENTRY_LIMIT = 3;

class SelfResolving {
  public static reentries = 0;

  @OnStart()
  public async onStart(): Promise<void> {
    SelfResolving.reentries++;

    if (SelfResolving.reentries > REENTRY_LIMIT) {
      throw new Error('re-entered past the limit: the cycle was not detected');
    }

    await container.resolve('SelfResolving');
  }
}

class Unrelated {}

let container: Container;

describe('re-entrant resolve() from a start hook', () => {
  test('a transient whose @OnStart resolves its own key rejects with CircularDependencyError', async () => {
    SelfResolving.reentries = 0;
    container = new Container();
    await container.register('SelfResolving', SelfResolving, false);

    let caught: unknown;

    try {
      await container.resolve('SelfResolving');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).cause).toBeInstanceOf(CircularDependencyError);
    expect(((caught as Error).cause as Error).message).toBe(
      'Circular dependency detected: SelfResolving -> SelfResolving',
    );
  });

  test('an unrelated resolve() in flight alongside the cycle still resolves', async () => {
    SelfResolving.reentries = 0;
    container = new Container();
    await container.register('SelfResolving', SelfResolving, false);
    await container.register('Unrelated', Unrelated, false);

    const [unrelated, cycle] = await Promise.allSettled([
      container.resolve('Unrelated'),
      container.resolve('SelfResolving'),
    ]);

    expect(unrelated.status).toBe('fulfilled');
    expect(cycle.status).toBe('rejected');
    expect(((cycle as PromiseRejectedResult).reason as Error).cause).toBeInstanceOf(CircularDependencyError);
  });

  test('a timer started by a start hook does not inherit a finished chain', async () => {
    TimedSelf.scheduled = false;
    container = new Container();
    await container.register('TimedSelf', TimedSelf, false);

    const later = new Promise<unknown>((resolve) => {
      TimedSelf.onLater = resolve;
    });

    await container.resolve('TimedSelf');

    expect(await later).toBeInstanceOf(TimedSelf);
  });
});

class TimedSelf {
  public static scheduled = false;
  public static onLater: (value: unknown) => void;

  @OnStart()
  public onStart(): void {
    if (TimedSelf.scheduled) return;

    TimedSelf.scheduled = true;
    setTimeout(() => {
      container.resolve('TimedSelf').then(TimedSelf.onLater);
    }, 0);
  }
}
