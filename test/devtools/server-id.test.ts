import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DevtoolsBus, devtoolsBus } from '../../lib/devtools/DevtoolsBus';
import type { DevtoolsServerContext } from '../../lib/devtools/context';
import type { AsenaAdapter } from '../../lib/adapter';
import { Config, EventService, MessageController, Schedule } from '../../lib/server/decorators';
import { On } from '../../lib/server/event';
import { InMemoryTransport, MessagePattern } from '../../lib/server/microservice';
import type { AsenaSchedule } from '../../lib/server/schedule';
import { AsenaServerFactory, type AsenaServer } from '../../lib/server';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';
import { installDevtoolsHook } from './helpers';

@EventService('north')
class NorthEvents {
  @On('opened')
  public opened() {}
}

@Schedule({ cron: '0 5 * * *' })
class NorthInventory implements AsenaSchedule {
  public async execute() {}
}

@EventService('south')
class SouthEvents {
  @On('opened')
  public opened() {}
}

@Schedule({ cron: '0 5 * * *' })
class SouthInventory implements AsenaSchedule {
  public async execute() {}
}

@MessageController('south')
class SouthMessages {
  @MessagePattern('count')
  public count() {
    return 4;
  }
}

@Config()
class SouthConfig {
  public transport() {
    return { microservice: new InMemoryTransport() };
  }
}

describe('DevtoolsBus server id', () => {
  test('a record carries the server id it was opened with to every subscriber', async () => {
    const bus = new DevtoolsBus();
    const seen: [string, string | undefined][] = [];

    bus.enable();
    bus.subscribe((record, serverId) => seen.push([record.path, serverId]));

    bus.close(bus.open('GET', '/tagged', 'server-a'), 200, { kind: 'controller', name: 'X.y' });
    bus.close(bus.open('GET', '/untagged'), 200, { kind: 'controller', name: 'X.y' });
    bus.observe('@On', 'sync', 'H.sync', () => 1, 'server-b');
    await bus.observe('@On', 'async', 'H.async', async () => 1, 'server-c');

    expect(seen).toEqual([
      ['/tagged', 'server-a'],
      ['/untagged', undefined],
      ['sync', 'server-b'],
      ['async', 'server-c'],
    ]);
  });
});

describe('server id of an AsenaServer', () => {
  let restore: (() => void) | undefined;
  const servers: AsenaServer<any>[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await server.stop();
    }

    restore?.();
    restore = undefined;
  });

  const boot = async (components: any[]) => {
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components,
      shutdown: { signals: false },
    });

    servers.push(server);
    await server.start();

    return server;
  };

  test('each server hands the hook its own id, and every dispatch record carries the id of the server that ran it', async () => {
    const contexts: DevtoolsServerContext[] = [];

    restore = installDevtoolsHook((context) => {
      contexts.push(context);
    });

    await boot([NorthEvents, NorthInventory]);
    await boot([SouthEvents, SouthInventory, SouthMessages, SouthConfig]);

    const [north, south] = contexts;

    expect(typeof north.serverId).toBe('string');
    expect(north.serverId).not.toBe('');
    expect(south.serverId).not.toBe(north.serverId);

    const seen: [string, string, string | undefined][] = [];

    devtoolsBus.subscribe((record, serverId) => seen.push([record.method, record.path, serverId]));

    north.events.emit('north.opened');
    south.events.emit('south.opened');
    await north.cron.runNow('NorthInventory');
    await south.cron.runNow('SouthInventory');
    expect(await south.ulak.send('south.count', {})).toBe(4);
    await Bun.sleep(5);

    expect(seen.sort()).toEqual(
      [
        ['@On', 'north.opened', north.serverId],
        ['@On', 'south.opened', south.serverId],
        ['@Schedule', 'NorthInventory', north.serverId],
        ['@Schedule', 'SouthInventory', south.serverId],
        ['@MessagePattern', 'south.count', south.serverId],
      ].sort() as [string, string, string][],
    );
  });

  test('the adapter gets a bus whose records carry the id of its server', async () => {
    const contexts: DevtoolsServerContext[] = [];

    restore = installDevtoolsHook((context) => {
      contexts.push(context);
    });

    const { adapter } = createMockAdapter();
    const attach = mock((_bus: unknown) => {});

    (adapter as any).onError = mock(() => {});
    (adapter as any).onNotFound = mock(() => {});
    (adapter as any).registerHTMLRoute = mock(() => {});
    (adapter as any).attachDevtools = attach;

    const app = await createTestApp({ adapter: adapter as any, logger: silentLogger, components: [NorthEvents] });

    try {
      const bus = attach.mock.calls[0][0] as Parameters<NonNullable<AsenaAdapter<any, any>['attachDevtools']>>[0];
      const seen: [string, string | undefined, string[]][] = [];

      devtoolsBus.subscribe((record, serverId) =>
        seen.push([record.path, serverId, record.steps.map((step) => step.name)]),
      );

      expect(bus.enabled).toBe(true);
      expect(contexts[0].serverId).toMatch(/^server-\d+$/);

      const record = bus.open('GET', '/shelves');

      bus.run(record, () => bus.step('controller', 'ShelfController.list'));
      bus.close(record, 200);

      expect(seen).toEqual([['/shelves', contexts[0].serverId, ['ShelfController.list']]]);
    } finally {
      await app.stop();
    }
  });
});
