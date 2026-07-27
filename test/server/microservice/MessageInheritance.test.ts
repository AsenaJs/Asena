import { beforeEach, describe, expect, test } from 'bun:test';
import { Container, ICoreServiceNames } from '../../../lib/ioc';
import { InMemoryTransport } from '../../../lib/server/microservice';
import { EventPattern, MessagePattern } from '../../../lib/server/microservice/decorators';
import { MessageController } from '../../../lib/server/decorators';
import { PrepareMicroserviceService } from '../../../lib/server/src/services/PrepareMicroserviceService';

// Same contract as @On, but the stakes are higher: an inherited @EventPattern opens a real
// broker subscription. These run against InMemoryTransport so the whole registration path -
// prefix joining, skip, duplicate detection - is exercised without a broker.

describe('@MessagePattern / @EventPattern inheritance', () => {
  let container: Container;
  let transport: InMemoryTransport;
  let prepareService: PrepareMicroserviceService;
  let logs: string[];

  beforeEach(async () => {
    container = new Container();
    transport = new InMemoryTransport();
    prepareService = new PrepareMicroserviceService();
    logs = [];

    await container.registerInstance(ICoreServiceNames.CONTAINER, container);

    (prepareService as any).container = container;
    (prepareService as any).ulak = { setMicroserviceTransports: () => {} };
    (prepareService as any).logger = {
      info: (message: string) => logs.push(message),
      warn: () => {},
      error: () => {},
      profile: () => {},
    };
  });

  const boot = async (controllers: [any, string][]) => {
    for (const [Class, name] of controllers) {
      await container.register(name, Class, true);
    }

    await prepareService.prepare(new Map([['default', transport]]));
  };

  test('registers a handler declared only on the base class', async () => {
    abstract class OrderBase {
      @MessagePattern('get')
      public async get() {
        return 'from base';
      }
    }

    @MessageController('order')
    class OrderController extends OrderBase {}

    await boot([[OrderController, 'OrderController']]);

    expect(await transport.send<string>('order.get')).toBe('from base');
  });

  // The shadowing regression, on the broker side.
  test('keeps inherited handlers when the subclass declares its own', async () => {
    abstract class OrderBase {
      @MessagePattern('get')
      public async get() {
        return 'inherited';
      }
    }

    @MessageController('order')
    class OrderController extends OrderBase {
      @MessagePattern('create')
      public async create() {
        return 'own';
      }
    }

    await boot([[OrderController, 'OrderController']]);

    expect(await transport.send<string>('order.get')).toBe('inherited');
    expect(await transport.send<string>('order.create')).toBe('own');
  });

  test('collects handlers from every level of a three-deep chain', async () => {
    abstract class Grandparent {
      @MessagePattern('a')
      public async a() {
        return 'a';
      }
    }

    abstract class Parent extends Grandparent {
      @MessagePattern('b')
      public async b() {
        return 'b';
      }
    }

    @MessageController('chain')
    class Leaf extends Parent {
      @MessagePattern('c')
      public async c() {
        return 'c';
      }
    }

    await boot([[Leaf, 'Leaf']]);

    expect(await transport.send<string>('chain.a')).toBe('a');
    expect(await transport.send<string>('chain.b')).toBe('b');
    expect(await transport.send<string>('chain.c')).toBe('c');
  });

  test('a subclass method with the same name overrides the inherited handler', async () => {
    abstract class OrderBase {
      @MessagePattern('get')
      public async get() {
        return 'base';
      }
    }

    @MessageController('order')
    class OrderController extends OrderBase {
      @MessagePattern('get')
      public override async get() {
        return 'subclass';
      }
    }

    await boot([[OrderController, 'OrderController']]);

    expect(await transport.send<string>('order.get')).toBe('subclass');
  });

  test("joins the subclass's prefix onto inherited patterns", async () => {
    abstract class SharedBase {
      @MessagePattern('ping')
      public async ping() {
        return 'pong';
      }
    }

    @MessageController('alpha')
    class AlphaController extends SharedBase {}

    @MessageController('beta')
    class BetaController extends SharedBase {}

    await boot([
      [AlphaController, 'AlphaController'],
      [BetaController, 'BetaController'],
    ]);

    expect(await transport.send<string>('alpha.ping')).toBe('pong');
    expect(await transport.send<string>('beta.ping')).toBe('pong');
  });

  test('honours prefix: false on an inherited handler', async () => {
    abstract class SharedBase {
      @MessagePattern({ pattern: 'payment.completed', prefix: false })
      public async onCompleted() {
        return 'absolute';
      }
    }

    @MessageController('order')
    class OrderController extends SharedBase {}

    await boot([[OrderController, 'OrderController']]);

    expect(await transport.send<string>('payment.completed')).toBe('absolute');
  });

  test('honours skip on an inherited handler', async () => {
    abstract class SharedBase {
      @MessagePattern({ pattern: 'get', skip: true })
      public async get() {
        return 'should not be reachable';
      }
    }

    @MessageController('order')
    class OrderController extends SharedBase {}

    await boot([[OrderController, 'OrderController']]);

    await expect(transport.send('order.get')).rejects.toThrow();
  });

  test('an inherited @EventPattern subscribes and fires', async () => {
    const received: any[] = [];

    abstract class SharedBase {
      @EventPattern('created')
      public async onCreated(data: any) {
        received.push(data);
      }
    }

    @MessageController('order')
    class OrderController extends SharedBase {}

    await boot([[OrderController, 'OrderController']]);

    await transport.emit('order.created', { id: 1 });
    await Bun.sleep(10);

    expect(received).toEqual([{ id: 1 }]);
  });

  test('two @MessagePattern handlers on the same resolved pattern throw', async () => {
    abstract class SharedBase {
      @MessagePattern('get')
      public async get() {
        return 'base';
      }
    }

    @MessageController('order')
    class OrderController extends SharedBase {
      // Different method name, same resolved pattern as the inherited one
      @MessagePattern('get')
      public async fetch() {
        return 'conflict';
      }
    }

    await expect(boot([[OrderController, 'OrderController']])).rejects.toThrow(/Duplicate message pattern detected/);
  });

  test('two controllers resolving to the same message pattern throw', async () => {
    @MessageController('shared')
    class FirstController {
      @MessagePattern('get')
      public async get() {
        return 'first';
      }
    }

    @MessageController('shared')
    class SecondController {
      @MessagePattern('get')
      public async alsoGet() {
        return 'second';
      }
    }

    await expect(
      boot([
        [FirstController, 'FirstController'],
        [SecondController, 'SecondController'],
      ]),
    ).rejects.toThrow(/Duplicate message pattern detected/);
  });

  test('several @EventPattern handlers may share a pattern (fan-out stays legal)', async () => {
    const received: string[] = [];

    abstract class SharedBase {
      @EventPattern('created')
      public async auditCreated() {
        received.push('base');
      }
    }

    @MessageController('order')
    class OrderController extends SharedBase {
      @EventPattern('created')
      public async notifyCreated() {
        received.push('own');
      }
    }

    await boot([[OrderController, 'OrderController']]);

    await transport.emit('order.created', {});
    await Bun.sleep(10);

    expect(received.sort()).toEqual(['base', 'own']);
  });

  test('logs inherited handlers, and stays quiet without inheritance', async () => {
    abstract class SharedBase {
      @MessagePattern('get')
      public async get() {
        return 'x';
      }
    }

    @MessageController('order')
    class Inheriting extends SharedBase {}

    await boot([[Inheriting, 'Inheriting']]);

    expect(logs.some((message) => message.includes('inherits handlers') && message.includes('get'))).toBe(true);
  });

  // The half the test above claimed in its name but never had. An app that uses no inheritance
  // must see no extra startup noise at all.
  test('stays quiet for a controller that declares everything itself', async () => {
    @MessageController('plain')
    class PlainController {
      @MessagePattern('one')
      public async one() {
        return 1;
      }

      @MessagePattern('two')
      public async two() {
        return 2;
      }
    }

    logs.length = 0;

    await boot([[PlainController, 'PlainController']]);

    expect(logs.some((message) => message.includes('inherits handlers'))).toBe(false);
  });

  test('two controllers extending one base do not contaminate each other', async () => {
    const received: string[] = [];

    abstract class SharedBase {
      @EventPattern('shared.event')
      public async shared() {
        received.push('shared');
      }
    }

    @MessageController('first')
    class FirstController extends SharedBase {
      @EventPattern('first.only')
      public async firstOnly() {
        received.push('first-only');
      }
    }

    @MessageController('second')
    class SecondController extends SharedBase {}

    await boot([
      [FirstController, 'FirstController'],
      [SecondController, 'SecondController'],
    ]);

    // If the merge wrote back into SharedBase's stored record, SecondController would also
    // subscribe to `second.first.only` - a subscription its author never asked for.
    await transport.emit('second.first.only', {});
    await Bun.sleep(10);

    expect(received).toEqual([]);
  });
});
