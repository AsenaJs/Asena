import { describe, expect, test } from 'bun:test';
import { Container } from '../../lib/ioc';
import { Inject, OnStart } from '../../lib/ioc/component';

let container: Container;

class Slow {
  @OnStart()
  public async onStart(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

class Worker {
  public static received: unknown;

  @Inject('Slow')
  private slow!: Slow;

  @Inject('Boot')
  private boot!: unknown;

  @OnStart()
  public onStart(): void {
    Worker.received = this.boot;
  }
}

class Boot {
  public static background: Promise<unknown> | undefined;

  @OnStart()
  public onStart(): void {
    // Not awaited: the resolve outlives the construction that started it.
    Boot.background = container.resolve('Worker');
  }
}

describe('a resolve started from a start hook after its construction has settled', () => {
  test('does not treat the finished construction as still being resolved', async () => {
    Worker.received = undefined;
    Boot.background = undefined;
    container = new Container();
    await container.register('Slow', Slow, false);
    await container.register('Worker', Worker, false);
    await container.register('Boot', Boot, true);

    await Boot.background;

    expect(Worker.received).toBe(await container.resolve('Boot'));
  });
});
