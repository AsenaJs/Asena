import { beforeEach, describe, expect, test } from 'bun:test';
import { Container, ICoreServiceNames } from '../../../lib/ioc';
import { EventDispatchService, EventEmitter, On } from '../../../lib/server/event';
import { PrepareEventService } from '../../../lib/server/src/services/PrepareEventService';
import { EventService } from '../../../lib/server/decorators';

// @On handlers are read across the prototype chain. The failure this guards against was
// subtle: reading the nearest ancestor's record *whole* meant base-class handlers worked
// right up until the subclass declared one handler of its own, at which point every
// inherited handler silently stopped firing.

describe('@On inheritance', () => {
  let container: Container;
  let emitter: EventEmitter;
  let dispatcher: EventDispatchService;
  let prepareService: PrepareEventService;
  let logs: string[];

  beforeEach(async () => {
    container = new Container();
    dispatcher = new EventDispatchService();
    emitter = new EventEmitter();
    prepareService = new PrepareEventService();
    logs = [];

    await container.registerInstance(ICoreServiceNames.CONTAINER, container);
    await container.registerInstance(ICoreServiceNames.EVENT_DISPATCH_SERVICE, dispatcher);
    await container.registerInstance(ICoreServiceNames.EVENT_EMITTER, emitter);
    await container.registerInstance(ICoreServiceNames.PREPARE_EVENT_SERVICE, prepareService);

    (emitter as any).dispatcher = dispatcher;
    (prepareService as any).container = container;
    (prepareService as any).dispatchService = dispatcher;
    (prepareService as any).logger = {
      info: (message: string) => logs.push(message),
      warn: () => {},
      error: () => {},
      profile: () => {},
    };
  });

  const register = async (Class: any, name: string) => {
    await container.register(name, Class, true);
    await prepareService.prepare();
  };

  // prepare() walks every registered event service, so calling register() twice would process
  // the first one a second time and double its handlers.
  const registerAll = async (entries: [any, string][]) => {
    for (const [Class, name] of entries) {
      await container.register(name, Class, true);
    }

    await prepareService.prepare();
  };

  test('fires a handler declared only on the base class', async () => {
    const calls: string[] = [];

    abstract class NotifierBase {
      @On('user.created')
      public onCreated() {
        calls.push('base');
      }
    }

    @EventService()
    class Notifier extends NotifierBase {}

    await register(Notifier, 'Notifier');
    await emitter.emit('user.created');

    expect(calls).toEqual(['base']);
  });

  // The shadowing regression: one handler on the subclass used to wipe out the base's.
  test('keeps inherited handlers when the subclass declares its own', async () => {
    const calls: string[] = [];

    abstract class NotifierBase {
      @On('user.created')
      public onCreated() {
        calls.push('base');
      }
    }

    @EventService()
    class Notifier extends NotifierBase {
      @On('user.deleted')
      public onDeleted() {
        calls.push('own');
      }
    }

    await register(Notifier, 'Notifier');
    await emitter.emit('user.created');
    await emitter.emit('user.deleted');

    expect(calls.sort()).toEqual(['base', 'own']);
  });

  // @On deliberately has NO duplicate detection - multiple listeners on one event is the
  // point of an event bus. @MessagePattern does have it, and nothing here would fail if
  // someone added the same check to PrepareEventService "for symmetry".
  test('an inherited handler and an own handler on the SAME event both fire', async () => {
    const calls: string[] = [];

    abstract class AuditBase {
      @On('user.created')
      public audit() {
        calls.push('audit');
      }
    }

    @EventService()
    class Notifier extends AuditBase {
      @On('user.created')
      public notify() {
        calls.push('notify');
      }
    }

    await register(Notifier, 'Notifier');
    await emitter.emit('user.created');

    expect(calls.sort()).toEqual(['audit', 'notify']);
  });

  test('two services extending one base do not contaminate each other', async () => {
    const calls: string[] = [];

    abstract class SharedBase {
      @On('shared.event')
      public shared() {
        calls.push('shared');
      }
    }

    @EventService()
    class FirstService extends SharedBase {
      @On('first.only')
      public firstOnly() {
        calls.push('first-only');
      }
    }

    @EventService()
    class SecondService extends SharedBase {}

    await registerAll([
      [FirstService, 'FirstService'],
      [SecondService, 'SecondService'],
    ]);

    calls.length = 0;
    await emitter.emit('first.only');

    // One listener, not two: SecondService must not have picked up FirstService's handler
    // through the shared base's stored record.
    expect(calls).toEqual(['first-only']);
  });

  test('collects handlers from every level of a three-deep chain', async () => {
    const calls: string[] = [];

    abstract class Grandparent {
      @On('a')
      public onA() {
        calls.push('a');
      }
    }

    abstract class Parent extends Grandparent {
      @On('b')
      public onB() {
        calls.push('b');
      }
    }

    @EventService()
    class Leaf extends Parent {
      @On('c')
      public onC() {
        calls.push('c');
      }
    }

    await register(Leaf, 'Leaf');

    await emitter.emit('a');
    await emitter.emit('b');
    await emitter.emit('c');

    expect(calls.sort()).toEqual(['a', 'b', 'c']);
  });

  test('a subclass method with the same name overrides the inherited handler once', async () => {
    const calls: string[] = [];

    abstract class NotifierBase {
      @On('user.created')
      public onCreated() {
        calls.push('base');
      }
    }

    @EventService()
    class Notifier extends NotifierBase {
      @On('user.created')
      public override onCreated() {
        calls.push('subclass');
      }
    }

    await register(Notifier, 'Notifier');
    await emitter.emit('user.created');

    expect(calls).toEqual(['subclass']);
  });

  test("applies the subclass's prefix to inherited handlers", async () => {
    const calls: string[] = [];

    abstract class NotifierBase {
      @On('created')
      public onCreated() {
        calls.push('hit');
      }
    }

    @EventService('order')
    class OrderNotifier extends NotifierBase {}

    await register(OrderNotifier, 'OrderNotifier');

    await emitter.emit('order.created');

    expect(calls).toEqual(['hit']);
  });

  test('honours skip on an inherited handler', async () => {
    const calls: string[] = [];

    abstract class NotifierBase {
      @On({ event: 'user.created', skip: true })
      public onCreated() {
        calls.push('should not fire');
      }
    }

    @EventService()
    class Notifier extends NotifierBase {}

    await register(Notifier, 'Notifier');
    await emitter.emit('user.created');

    expect(calls).toEqual([]);
  });

  test('logs inherited handlers, and stays quiet without inheritance', async () => {
    abstract class NotifierBase {
      @On('user.created')
      public onCreated() {}
    }

    @EventService()
    class Inheriting extends NotifierBase {}

    await register(Inheriting, 'Inheriting');

    expect(logs.some((message) => message.includes('inherits handlers') && message.includes('onCreated'))).toBe(true);

    logs.length = 0;

    @EventService()
    class SelfContained {
      @On('user.updated')
      public onUpdated() {}
    }

    await register(SelfContained, 'SelfContained');

    expect(logs.some((message) => message.includes('inherits handlers') && message.includes('onUpdated'))).toBe(false);
  });
});
