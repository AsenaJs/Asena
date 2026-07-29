import { beforeEach, describe, expect, test } from 'bun:test';
import type { InjectableComponent } from '../../lib/ioc';
import type { Class } from '../../lib/server/types';
import { Container, IocEngine } from '../../lib/ioc';
import { Implements, Inject, Strategy } from '../../lib/ioc/component';
import { Service } from '../../lib/server/decorators';

/**
 * Injected fields are accessors with no setter, which is a good property - the container owns
 * them. But the engine's own message for that ("Attempted to assign to readonly property.")
 * names neither the field nor the class nor the supported alternative, so the first person to
 * reach for `Object.assign(instance, {dep: double})` in a test spends a run working out what it
 * is telling them.
 */
@Service()
class OutboxWriter {
  public append(): string {
    return 'real';
  }
}

@Service()
class NotificationService {
  @Inject(OutboxWriter)
  private outbox: OutboxWriter;

  public notify(): string {
    return this.outbox.append();
  }
}

@Service()
@Implements('IChannel')
class EmailChannel {}

@Service()
class Broadcaster {
  @Strategy('IChannel')
  private channels: unknown[];

  public count(): number {
    return this.channels.length;
  }
}

describe('assigning to an injected field', () => {
  let engine: IocEngine;

  beforeEach(async () => {
    engine = new IocEngine();
    (engine as any)['_container'] = new Container();

    const classes: Class[] = [OutboxWriter, NotificationService, EmailChannel, Broadcaster];

    await engine.searchAndRegister(classes.map((Class) => ({ Class, interface: null }) as InjectableComponent));
  });

  test('names the field, the class and the way out for @Inject', async () => {
    const service: any = await engine.container.resolve('NotificationService');

    expect(() => Object.assign(service, { outbox: { append: () => 'double' } })).toThrow(
      "Cannot assign to 'outbox' on NotificationService: fields wired by @Inject are read-only.",
    );

    expect(() => Object.assign(service, { outbox: {} })).toThrow(/createTestApp\(\)\/createWebTest\(\)/);
    expect(() => Object.assign(service, { outbox: {} })).toThrow(/mockComponent\(\)/);
  });

  test('does the same for @Strategy', async () => {
    const broadcaster: any = await engine.container.resolve('Broadcaster');

    expect(() => Object.assign(broadcaster, { channels: [] })).toThrow(
      "Cannot assign to 'channels' on Broadcaster: fields wired by @Strategy are read-only.",
    );
  });

  test('leaves the real dependency in place after a refused assignment', async () => {
    const service: any = await engine.container.resolve('NotificationService');

    expect(() => Object.assign(service, { outbox: { append: () => 'double' } })).toThrow();
    expect(service.notify()).toBe('real');
  });
});
