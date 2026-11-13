import { describe, expect, test } from 'bun:test';
import type { ComponentPostProcessor } from '../../lib/ioc';
import { CircularDependencyError, ComponentType, Container } from '../../lib/ioc';
import { Inject, OnStart } from '../../lib/ioc/component';
import { Service } from '../../lib/server/decorators';

const REENTRY_LIMIT = 3;

function rootCause(error: unknown): unknown {
  let current = error;

  while (current instanceof Error && !(current instanceof CircularDependencyError) && current.cause) {
    current = current.cause;
  }

  return current;
}

class SelfResolvingPostProcessor implements ComponentPostProcessor {
  public static calls = 0;

  public async postProcess<T>(instance: T, Class: unknown): Promise<T> {
    if (Class !== Transient) return instance;

    SelfResolvingPostProcessor.calls++;

    if (SelfResolvingPostProcessor.calls > REENTRY_LIMIT) {
      throw new Error('re-entered past the limit: the cycle was not detected');
    }

    await container.resolve('Transient');

    return instance;
  }
}

class Transient {}

let container: Container;

describe('re-entrant resolve() from a post-processor', () => {
  test('a transient whose post-processor resolves its own key rejects with CircularDependencyError', async () => {
    SelfResolvingPostProcessor.calls = 0;
    container = new Container();
    container.registerPostProcessor(new SelfResolvingPostProcessor());
    await container.register('Transient', Transient, false);

    let caught: unknown;

    try {
      await container.resolve('Transient');
    } catch (error) {
      caught = error;
    }

    expect(rootCause(caught)).toBeInstanceOf(CircularDependencyError);
    expect((rootCause(caught) as Error).message).toBe('Circular dependency detected: Transient -> Transient');
  });
});

@Service()
class ChainTail {
  public static reentries = 0;

  @OnStart()
  public async onStart(): Promise<void> {
    ChainTail.reentries++;

    if (ChainTail.reentries > REENTRY_LIMIT) {
      throw new Error('re-entered past the limit: the cycle was not detected');
    }

    await container.resolveAll(ComponentType.SERVICE);
  }
}

@Service()
class ChainHead {
  @Inject('ChainTail')
  public tail: ChainTail;
}

describe('re-entrant resolveAll() from a start hook', () => {
  test('a resolveAll() that reaches back into the chain rejects with CircularDependencyError', async () => {
    ChainTail.reentries = 0;
    container = new Container();
    await container.register('ChainHead', ChainHead, false);
    await container.register('ChainTail', ChainTail, false);

    let caught: unknown;

    try {
      await container.resolve('ChainHead');
    } catch (error) {
      caught = error;
    }

    expect(rootCause(caught)).toBeInstanceOf(CircularDependencyError);
  });
});

let soloAllReentries = 0;

@Service()
class SoloAll {
  @OnStart()
  public async onStart(): Promise<void> {
    soloAllReentries++;

    if (soloAllReentries > REENTRY_LIMIT) {
      throw new Error('re-entered past the limit: the cycle was not detected');
    }

    await container.resolveAll(ComponentType.SERVICE);
  }
}

describe('re-entrant resolveAll() that rebuilds its own caller', () => {
  test('a prototype service whose start hook resolveAll()s rejects with CircularDependencyError', async () => {
    soloAllReentries = 0;
    container = new Container();
    await container.register('SoloAll', SoloAll, false);

    let caught: unknown;

    try {
      await container.resolve('SoloAll');
    } catch (error) {
      caught = error;
    }

    expect(rootCause(caught)).toBeInstanceOf(CircularDependencyError);
    expect((rootCause(caught) as Error).message).toBe('Circular dependency detected: SoloAll -> SoloAll');
  });
});
