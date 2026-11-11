import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  attachDevtoolsAgent,
  startDevtoolsAgent,
  type DevtoolsAgentOptions,
  type DevtoolsChannel,
} from '../../lib/devtools/agent';
import { EventService, Schedule } from '../../lib/server/decorators';
import { On } from '../../lib/server/event';
import type { AsenaSchedule } from '../../lib/server/schedule';
import type { DevtoolsAttachment, DevtoolsServerContext } from '../../lib/devtools/context';
import { buildDevtoolsSnapshot } from '../../lib/devtools/snapshot';
import { hostMessage, type DevtoolsAgentMessage, type DevtoolsCommand } from '../../lib/devtools/protocol';
import { computeReadiness } from '../../lib/server/health/readiness';
import { AsenaServerFactory, type AsenaServer } from '../../lib/server';
import { createCapturingLogger, silentLogger } from '../../lib/test/harness/silentLogger';
import manifest from '../../package.json';
import { installDevtoolsHook } from './helpers';
import { consoleAppComponents, NightlyRestock, PantryEvents } from './fixtures/console-app';

/** `stalled` models a host that stopped reading: nothing sent is flushed until `drain()`. */
const fakeChannel = ({ stalled = false }: { stalled?: boolean } = {}) => {
  const sent: DevtoolsAgentMessage[] = [];
  const unflushed: (() => void)[] = [];
  const listeners = new Set<(message: unknown) => void>();
  const channel: DevtoolsChannel = {
    send: (message, flushed) => {
      sent.push(message);

      if (stalled) {
        unflushed.push(flushed);
      } else {
        flushed();
      }
    },
    onMessage: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };

  return {
    channel,
    sent,
    listeners,
    deliver: (message: unknown) => listeners.forEach((listener) => listener(message)),
    drain: () => unflushed.splice(0).forEach((flushed) => flushed()),
  };
};

const payloadsOf = <T extends DevtoolsAgentMessage['type']>(sent: DevtoolsAgentMessage[], type: T) =>
  sent
    .filter((message) => message.type === type)
    .map((message) => message.payload as Extract<DevtoolsAgentMessage, { type: T }>['payload']);

describe('attachDevtoolsAgent', () => {
  let server: AsenaServer<any>;
  let context: DevtoolsServerContext;
  let restore: () => void;
  let attachment: DevtoolsAttachment | undefined;

  beforeEach(async () => {
    restore = installDevtoolsHook((handed) => {
      context = handed;
    });
    server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: consoleAppComponents,
      shutdown: { signals: false },
    });
    await server.start();
  });

  afterEach(async () => {
    attachment?.detach();
    attachment = undefined;
    await server.stop();
    restore();
  });

  test('announces itself, then sends the snapshot', () => {
    const { channel, sent } = fakeChannel();

    attachment = startDevtoolsAgent(context, { channel });

    expect(sent.map((message) => message.type)).toEqual(['hello', 'snapshot']);
    expect(sent.every((message) => message.v === 1)).toBe(true);
    expect(payloadsOf(sent, 'hello')).toEqual([
      {
        serverId: context.serverId,
        coreVersion: manifest.version,
        adapter: null,
        port: null,
        pid: process.pid,
        transports: [{ name: 'default', connected: true }],
      },
    ]);
    expect(payloadsOf(sent, 'snapshot')).toEqual([
      { ...buildDevtoolsSnapshot(context.container, context), serverId: context.serverId },
    ]);
  });

  test('samples metrics on the interval, readiness by the health probe rule', async () => {
    const { channel, sent } = fakeChannel();

    attachment = startDevtoolsAgent(context, { channel, sampleIntervalMs: 10 });

    for (let waited = 0; payloadsOf(sent, 'metrics').length < 2 && waited < 2000; waited += 10) {
      await Bun.sleep(10);
    }

    const metrics = payloadsOf(sent, 'metrics');

    expect(metrics.length).toBeGreaterThanOrEqual(2);

    for (const sample of metrics) {
      expect(sample.rss).toBeGreaterThan(0);
      expect(sample.heapUsed).toBeGreaterThan(0);
      // Not compared with heapUsed: after a large collection Bun reports a heapTotal below it.
      expect(sample.heapTotal).toBeGreaterThan(0);
      expect(sample.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(sample.eventLoopLagMs).toBeGreaterThanOrEqual(0);
      expect(sample.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(sample.transports).toEqual([{ name: 'default', connected: true }]);
      expect(sample.servers).toEqual({
        [context.serverId]: { readiness: sample.readiness, transports: [{ name: 'default', connected: true }] },
      });
      expect(sample).not.toHaveProperty('dropped');
    }

    expect(metrics.at(-1)!.readiness).toEqual(
      computeReadiness(context.lifecycle.state, context.ulak.getMicroserviceTransports()),
    );
    expect(metrics.at(-1)!.readiness).toEqual({ status: 'up', transports: { default: 'connected' } });
  });

  // Teardown destroys the transports while the sampler still ticks; a third-party isConnected getter
  // that dereferences a destroyed client must not become an uncaught exception from a timer.
  test('skips a metrics tick whose transport getter throws, and samples again once it recovers', async () => {
    const { channel, sent } = fakeChannel();
    let broken = false;
    const transport = {
      get isConnected() {
        if (broken) {
          throw new Error('client destroyed');
        }

        return true;
      },
    };
    const transports = spyOn(context.ulak, 'getMicroserviceTransports').mockImplementation(
      () => new Map([['default', transport as any]]),
    );

    try {
      attachment = startDevtoolsAgent(context, { channel, sampleIntervalMs: 5 });
      broken = true;

      const whileBroken = payloadsOf(sent, 'metrics').length;

      await Bun.sleep(40);
      expect(payloadsOf(sent, 'metrics').length).toBe(whileBroken);

      broken = false;

      for (let waited = 0; payloadsOf(sent, 'metrics').length === whileBroken && waited < 2000; waited += 10) {
        await Bun.sleep(10);
      }

      expect(payloadsOf(sent, 'metrics').at(-1)!.transports).toEqual([{ name: 'default', connected: true }]);
    } finally {
      transports.mockRestore();
    }
  });

  // process.send() under Bun returns true even with megabytes queued for a host that stopped reading,
  // so the agent bounds what it has handed over but not yet seen flushed.
  test('drops records and metrics while the host is not reading, still answers commands, and reports the count', async () => {
    const { channel, sent, deliver, drain } = fakeChannel({ stalled: true });
    const emitEvent = (id: string) =>
      deliver(hostMessage('command', { id, command: 'emitEvent', event: 'pantry.restocked', data: {} }));

    // hello and the snapshot fill the two slots.
    attachment = startDevtoolsAgent(context, { channel, sampleIntervalMs: 5, maxPendingMessages: 2 });
    emitEvent('e1');
    emitEvent('e2');
    emitEvent('e3');
    await Bun.sleep(30);

    expect(payloadsOf(sent, 'request')).toEqual([]);
    expect(payloadsOf(sent, 'metrics')).toEqual([]);
    expect(payloadsOf(sent, 'commandResult').map((result) => result.id)).toEqual(['e1', 'e2', 'e3']);

    drain();

    for (let waited = 0; payloadsOf(sent, 'metrics').length === 0 && waited < 2000; waited += 5) {
      await Bun.sleep(5);
    }

    const [firstAfterDrain] = payloadsOf(sent, 'metrics');

    // The three records plus every metrics tick of the 30 ms stall.
    expect(firstAfterDrain.dropped).toBeGreaterThan(3);
    expect(firstAfterDrain.servers[context.serverId].dropped).toBe(firstAfterDrain.dropped);

    drain();
    emitEvent('e4');
    await Bun.sleep(5);

    expect(payloadsOf(sent, 'request').map((record) => record.path)).toEqual(['pantry.restocked']);
  });

  test('answers commands through the real dispatch paths, with the correlation id', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const command = (id: string, body: DevtoolsCommand) => deliver(hostMessage('command', { id, ...body }));
    const runsBefore = NightlyRestock.runs;
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});

    attachment = startDevtoolsAgent(context, { channel });

    try {
      command('c1', { command: 'runSchedule', name: 'NightlyRestock' });
      command('c2', { command: 'emitEvent', event: 'pantry.restocked', data: { item: 'flour' } });
      command('c3', {
        command: 'sendMessage',
        transport: 'default',
        pattern: 'pantry.count',
        kind: 'message',
        data: { item: 'rice' },
      });
      command('c4', { command: 'sendMessage', transport: 'default', pattern: 'pantry.reserve', kind: 'message' });
      command('c5', { command: 'sendMessage', transport: 'default', pattern: 'pantry.nowhere', kind: 'message' });
      command('c6', { command: 'runSchedule', name: 'FailingAudit' });
      command('c7', { command: 'sendMessage', transport: 'default', pattern: 'pantry.audit', kind: 'event' });
      command('c8', { command: 'teleport' } as any);
      deliver({ v: 2, type: 'command', payload: { id: 'ignored', command: 'runSchedule', name: 'NightlyRestock' } });
      await Bun.sleep(20);
    } finally {
      consoleError.mockRestore();
    }

    const results = Object.fromEntries(payloadsOf(sent, 'commandResult').map((result) => [result.id, result]));

    const { serverId } = context;

    expect(Object.keys(results).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(results.c1).toEqual({ id: 'c1', serverId, ok: true, result: { ran: 'NightlyRestock' } });
    expect(NightlyRestock.runs).toBe(runsBefore + 1);
    expect(results.c2).toEqual({ id: 'c2', serverId, ok: true, result: { delivered: true } });
    expect(PantryEvents.received.at(-1)).toEqual({ item: 'flour' });
    expect(results.c3).toEqual({ id: 'c3', serverId, ok: true, result: { reply: { item: 'rice', count: 3 } } });
    // The @Catch answered, so the reply is its return value, exactly as for any other caller.
    expect(results.c4).toEqual({ id: 'c4', serverId, ok: true, result: { reply: { reserved: false } } });
    expect(results.c5).toMatchObject({ id: 'c5', serverId, ok: false, error: { name: 'UlakError' } });
    expect(results.c6).toEqual({ id: 'c6', serverId, ok: false, error: { name: 'Error', message: 'audit failed' } });
    expect(results.c7).toEqual({ id: 'c7', serverId, ok: true, result: { emitted: true } });
    expect(results.c8).toEqual({
      id: 'c8',
      serverId,
      ok: false,
      error: { name: 'Error', message: 'Unknown command "teleport"' },
    });
  });

  // A version-skewed or buggy host must never take the app down: before, `payload: null` became an
  // unhandled rejection and a command without an id still ran.
  test('ignores a host message whose payload is not a command with an id', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const runsBefore = NightlyRestock.runs;

    attachment = startDevtoolsAgent(context, { channel });
    deliver({ v: 1, type: 'command', payload: null });
    deliver({ v: 1, type: 'command', payload: 'runSchedule' });
    deliver({ v: 1, type: 'command', payload: { command: 'runSchedule', name: 'NightlyRestock' } });
    await Bun.sleep(20);

    expect(payloadsOf(sent, 'commandResult')).toEqual([]);
    expect(NightlyRestock.runs).toBe(runsBefore);
  });

  test('refuses a sendMessage whose kind is neither message nor event, instead of emitting', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const emit = spyOn(context.ulak, 'emit');
    const send = spyOn(context.ulak, 'send');

    attachment = startDevtoolsAgent(context, { channel });

    try {
      deliver(
        hostMessage('command', {
          id: 'k1',
          command: 'sendMessage',
          transport: 'default',
          pattern: 'pantry.audit',
          kind: 'bogus',
        } as any),
      );
      deliver(
        hostMessage('command', {
          id: 'k2',
          command: 'sendMessage',
          transport: 'default',
          pattern: 'pantry.audit',
        } as any),
      );
      await Bun.sleep(20);

      expect(emit).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      emit.mockRestore();
      send.mockRestore();
    }

    const results = payloadsOf(sent, 'commandResult');

    const { serverId } = context;

    expect(results).toEqual([
      { id: 'k1', serverId, ok: false, error: { name: 'Error', message: 'Unknown sendMessage kind "bogus"' } },
      { id: 'k2', serverId, ok: false, error: { name: 'Error', message: 'Unknown sendMessage kind undefined' } },
    ]);
  });

  test('refuses a command whose required field has the wrong type, without running it', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const spies = [
      spyOn(context.events, 'emit'),
      spyOn(context.cron, 'runNow'),
      spyOn(context.ulak, 'send'),
      spyOn(context.ulak, 'emit'),
    ];
    const command = (id: string, body: Record<string, unknown>) =>
      deliver(hostMessage('command', { id, ...body } as any));

    attachment = startDevtoolsAgent(context, { channel });

    try {
      command('t1', { command: 'emitEvent', event: 42 });
      command('t2', { command: 'emitEvent' });
      command('t3', { command: 'runSchedule', name: { job: 'NightlyRestock' } });
      command('t4', { command: 'sendMessage', transport: 'default', pattern: 7, kind: 'message' });
      command('t5', { command: 'sendMessage', transport: null, pattern: 'pantry.audit', kind: 'event' });
      await Bun.sleep(20);

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }

    const refused = (id: string, message: string) => ({
      id,
      serverId: context.serverId,
      ok: false,
      error: { name: 'Error', message },
    });

    expect(payloadsOf(sent, 'commandResult')).toEqual([
      refused('t1', 'emitEvent needs a string "event", got number'),
      refused('t2', 'emitEvent needs a string "event", got undefined'),
      refused('t3', 'runSchedule needs a string "name", got object'),
      refused('t4', 'sendMessage needs a string "pattern", got number'),
      refused('t5', 'sendMessage needs a string "transport", got null'),
    ]);
  });

  // An error whose own `message` throws cannot be turned into a result; before, the host waited for
  // an answer that never came and nothing said why.
  test('a command whose failure cannot be described is logged once at warn and still answered', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const { logger, entries } = createCapturingLogger();
    const hostile = Object.defineProperty(new Error('hidden'), 'message', {
      get: () => {
        throw new Error('message getter exploded');
      },
    });
    const runNow = spyOn(context.cron, 'runNow').mockRejectedValue(hostile);
    const consoleSpies = (['log', 'warn', 'error'] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {}),
    );

    attachment = startDevtoolsAgent({ ...context, logger }, { channel });

    try {
      deliver(hostMessage('command', { id: 'h1', command: 'runSchedule', name: 'NightlyRestock' }));
      await Bun.sleep(20);

      for (const spy of consoleSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      runNow.mockRestore();
      consoleSpies.forEach((spy) => spy.mockRestore());
    }

    expect(entries).toEqual([
      {
        level: 'warn',
        message: '[devtools] command "h1" (runSchedule) failed outside its handler: message getter exploded',
        meta: undefined,
      },
    ]);
    expect(payloadsOf(sent, 'commandResult')).toEqual([
      {
        id: 'h1',
        serverId: context.serverId,
        ok: false,
        error: { name: 'Error', message: 'The command failed and the agent could not turn its error into a result' },
      },
    ]);
  });

  // Teardown closes pools, transports and ulak before the agent detaches; a command run then hits a
  // half-stopped app, and runNow would even run a job the cron runner has already stopped.
  test('refuses commands once the server is stopping, without running them', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const runsBefore = NightlyRestock.runs;

    attachment = startDevtoolsAgent(context, { channel });
    await server.stop();
    deliver(hostMessage('command', { id: 'late', command: 'runSchedule', name: 'NightlyRestock' }));
    await Bun.sleep(20);

    expect(NightlyRestock.runs).toBe(runsBefore);
    expect(payloadsOf(sent, 'commandResult')).toEqual([
      {
        id: 'late',
        serverId: context.serverId,
        ok: false,
        error: { name: 'Error', message: 'The server is stopping; the command was not run' },
      },
    ]);
  });

  test('forwards the records the bus closes as request messages', async () => {
    const { channel, sent, deliver } = fakeChannel();

    attachment = startDevtoolsAgent(context, { channel });
    deliver(hostMessage('command', { id: 'r1', command: 'emitEvent', event: 'pantry.restocked', data: {} }));
    deliver(hostMessage('command', { id: 'r2', command: 'runSchedule', name: 'NightlyRestock' }));
    await Bun.sleep(10);

    expect(
      payloadsOf(sent, 'request')
        .map(({ serverId, method, path, status, answeredBy }) => ({ serverId, method, path, status, answeredBy }))
        .sort((a, b) => a.method.localeCompare(b.method)),
    ).toEqual([
      {
        serverId: context.serverId,
        method: '@On',
        path: 'pantry.restocked',
        status: 200,
        answeredBy: { kind: 'controller', name: 'PantryEvents.restocked' },
      },
      {
        serverId: context.serverId,
        method: '@Schedule',
        path: 'NightlyRestock',
        status: 200,
        answeredBy: { kind: 'controller', name: 'NightlyRestock.execute' },
      },
    ]);
  });

  test('detach tells the host the server is gone, then releases the IPC listener, the sampler and the bus subscription', async () => {
    const { channel, sent, listeners, deliver } = fakeChannel();
    const detached = startDevtoolsAgent(context, { channel, sampleIntervalMs: 5 });

    detached.detach();
    detached.detach();

    expect(sent.map((message) => message.type)).toEqual(['hello', 'snapshot', 'serverStopped']);
    expect(payloadsOf(sent, 'serverStopped')).toEqual([{ serverId: context.serverId }]);

    deliver(hostMessage('command', { id: 'late', command: 'emitEvent', event: 'pantry.restocked' }));
    context.events.emit('pantry.restocked', {});
    await Bun.sleep(25);

    expect(listeners.size).toBe(0);
    expect(sent).toHaveLength(3);
  });

  // The commands run any schedule and publish to real brokers; a production process started under a
  // console-like parent must not hand them out.
  test('refuses to attach when NODE_ENV is production, and says so once', () => {
    const { channel, sent, listeners } = fakeChannel();
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const previousEnv = process.env.NODE_ENV;
    const before = [console.log, process.stdout.write, process.stderr.write];

    process.env.NODE_ENV = 'production';

    try {
      startDevtoolsAgent(context, { channel }).detach();
      startDevtoolsAgent(context, { channel }).detach();

      expect(sent).toEqual([]);
      expect(listeners.size).toBe(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('NODE_ENV is production');
    } finally {
      process.env.NODE_ENV = previousEnv;
      warn.mockRestore();
    }

    expect([console.log, process.stdout.write, process.stderr.write]).toEqual(before);
  });

  test('without an IPC channel it stays inert, patches no output function and says so once', () => {
    const previousSend = process.send;
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const outputFunctions = () => [
      console.log,
      console.warn,
      console.trace,
      process.stdout.write,
      process.stderr.write,
    ];
    const before = outputFunctions();

    (process as any).send = undefined;

    try {
      const inert = attachDevtoolsAgent(context);

      expect(outputFunctions()).toEqual(before);
      inert.detach();
      attachDevtoolsAgent(context).detach();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('no IPC channel');
    } finally {
      (process as any).send = previousSend;
      warn.mockRestore();
    }
  });
});

@EventService('cellar')
class CellarEvents {
  @On('opened')
  public opened() {}
}

@Schedule({ cron: '0 3 * * *' })
class CellarCount implements AsenaSchedule {
  public static runs = 0;

  public async execute() {
    CellarCount.runs += 1;
  }
}

// The pantry server attaches first, the cellar server second: the cellar is "the most recent".
describe('attachDevtoolsAgent with two servers in one process', () => {
  let pantryServer: AsenaServer<any>;
  let cellarServer: AsenaServer<any>;
  let pantry: DevtoolsServerContext;
  let cellar: DevtoolsServerContext;
  let restore: () => void;
  let attachments: DevtoolsAttachment[];

  const boot = async (components: any[]) => {
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components,
      shutdown: { signals: false },
    });

    await server.start();

    return server;
  };

  const attachBoth = (pantryOptions: DevtoolsAgentOptions, cellarOptions: DevtoolsAgentOptions = pantryOptions) => {
    const older = startDevtoolsAgent(pantry, pantryOptions);
    const newer = startDevtoolsAgent(cellar, cellarOptions);

    attachments.push(older, newer);

    return { older, newer };
  };

  beforeEach(async () => {
    const contexts: DevtoolsServerContext[] = [];

    attachments = [];
    restore = installDevtoolsHook((handed) => {
      contexts.push(handed);
    });
    pantryServer = await boot(consoleAppComponents);
    cellarServer = await boot([CellarEvents, CellarCount]);
    [pantry, cellar] = contexts;
  });

  afterEach(async () => {
    attachments.forEach((attachment) => attachment.detach());
    await pantryServer.stop();
    await cellarServer.stop();
    restore();
  });

  test('each server says hello and sends its own snapshot under its own id', () => {
    const { channel, sent } = fakeChannel();

    attachBoth({ channel });

    expect(pantry.serverId).not.toBe(cellar.serverId);
    expect(sent.map((message) => [message.type, (message.payload as { serverId: string }).serverId])).toEqual([
      ['hello', pantry.serverId],
      ['snapshot', pantry.serverId],
      ['hello', cellar.serverId],
      ['snapshot', cellar.serverId],
    ]);
    expect(payloadsOf(sent, 'hello').map((hello) => hello.transports)).toEqual([
      [{ name: 'default', connected: true }],
      [],
    ]);
    expect(payloadsOf(sent, 'snapshot').map((snapshot) => snapshot.schedules.map((job) => job.name).sort())).toEqual([
      ['FailingAudit', 'NightlyRestock'],
      ['CellarCount'],
    ]);
  });

  test('a command runs on the server it names, on the most recent one when it names none, and once', async () => {
    const { channel, sent, listeners, deliver } = fakeChannel();
    const command = (id: string, body: Record<string, unknown>) =>
      deliver(hostMessage('command', { id, ...body } as any));
    const pantryRuns = NightlyRestock.runs;
    const cellarRuns = CellarCount.runs;
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});

    attachBoth({ channel });

    try {
      expect(listeners.size).toBe(1);

      command('recent', { command: 'runSchedule', name: 'CellarCount' });
      command('recent-miss', { command: 'runSchedule', name: 'NightlyRestock' });
      command('named-older', { serverId: pantry.serverId, command: 'runSchedule', name: 'NightlyRestock' });
      command('named-newer', { serverId: cellar.serverId, command: 'emitEvent', event: 'cellar.opened' });
      command('named-miss', { serverId: cellar.serverId, command: 'runSchedule', name: 'NightlyRestock' });
      command('unknown', { serverId: 'server-0', command: 'runSchedule', name: 'NightlyRestock' });
      command('not-a-string', { serverId: 7, command: 'runSchedule', name: 'NightlyRestock' });
      command('null', { serverId: null, command: 'runSchedule', name: 'NightlyRestock' });
      await Bun.sleep(20);
    } finally {
      consoleError.mockRestore();
    }

    const results = payloadsOf(sent, 'commandResult');
    const byId = Object.fromEntries(results.map((result) => [result.id, result]));

    expect(results).toHaveLength(8);
    expect(NightlyRestock.runs).toBe(pantryRuns + 1);
    expect(CellarCount.runs).toBe(cellarRuns + 1);
    expect(byId.recent).toEqual({ id: 'recent', serverId: cellar.serverId, ok: true, result: { ran: 'CellarCount' } });
    expect(byId['recent-miss']).toMatchObject({ serverId: cellar.serverId, ok: false });
    expect(byId['named-older']).toEqual({
      id: 'named-older',
      serverId: pantry.serverId,
      ok: true,
      result: { ran: 'NightlyRestock' },
    });
    expect(byId['named-newer']).toEqual({
      id: 'named-newer',
      serverId: cellar.serverId,
      ok: true,
      result: { delivered: true },
    });
    expect(byId['named-miss']).toMatchObject({ serverId: cellar.serverId, ok: false });
    expect(byId.unknown).toEqual({
      id: 'unknown',
      ok: false,
      error: { name: 'Error', message: 'No attached server has the id "server-0"; the command was not run' },
    });
    expect(byId['not-a-string']).toEqual({
      id: 'not-a-string',
      ok: false,
      error: { name: 'Error', message: 'A command\'s "serverId" must be a string, got number' },
    });
    expect(byId.null).toEqual({
      id: 'null',
      ok: false,
      error: { name: 'Error', message: 'A command\'s "serverId" must be a string, got null' },
    });
  });

  test('a record reaches the host once, from the server that produced it', async () => {
    const { channel, sent } = fakeChannel();

    attachBoth({ channel });
    pantry.events.emit('pantry.restocked', {});
    cellar.events.emit('cellar.opened');
    await pantry.cron.runNow('NightlyRestock');
    await cellar.cron.runNow('CellarCount');
    await Bun.sleep(10);

    expect(
      payloadsOf(sent, 'request')
        .map(({ serverId, path }) => [path, serverId])
        .sort(),
    ).toEqual(
      [
        ['pantry.restocked', pantry.serverId],
        ['cellar.opened', cellar.serverId],
        ['NightlyRestock', pantry.serverId],
        ['CellarCount', cellar.serverId],
      ].sort(),
    );
  });

  test('one metrics sample per tick carries the process numbers once and every server by id', async () => {
    const olderHost = fakeChannel();
    const newerHost = fakeChannel();
    const { newer } = attachBoth(
      { channel: olderHost.channel, sampleIntervalMs: 5 },
      { channel: newerHost.channel, sampleIntervalMs: 5 },
    );

    await Bun.sleep(40);

    const samples = payloadsOf(newerHost.sent, 'metrics');

    expect(samples.length).toBeGreaterThan(0);
    expect(payloadsOf(olderHost.sent, 'metrics')).toEqual([]);

    for (const sample of samples) {
      expect(sample.rss).toBeGreaterThan(0);
      expect(sample.servers).toEqual({
        [pantry.serverId]: {
          readiness: { status: 'up', transports: { default: 'connected' } },
          transports: [{ name: 'default', connected: true }],
        },
        [cellar.serverId]: { readiness: { status: 'up' }, transports: [] },
      });
      // What a host that does not read `servers` sees: the most recent server, as before.
      expect(sample.readiness).toEqual({ status: 'up' });
      expect(sample.transports).toEqual([]);
    }

    newer.detach();
    await Bun.sleep(40);

    const handedOver = payloadsOf(olderHost.sent, 'metrics');

    expect(handedOver.length).toBeGreaterThan(0);
    // The sampler starts when the server takes over, so the time before is not counted as lag.
    expect(handedOver[0].eventLoopLagMs).toBeLessThan(30);

    for (const sample of handedOver) {
      expect(Object.keys(sample.servers)).toEqual([pantry.serverId]);
      expect(sample.transports).toEqual([{ name: 'default', connected: true }]);
    }
  });

  // A transport getter of one server that throws must not cost the other server its sample.
  test('a server whose state cannot be read is left out of the sample; the other one is still reported', async () => {
    for (const broken of ['older', 'newer'] as const) {
      const { channel, sent } = fakeChannel();
      const both = attachBoth({ channel, sampleIntervalMs: 5 });
      const [unreadable, readable] = broken === 'older' ? [pantry, cellar] : [cellar, pantry];
      const transports = spyOn(unreadable.ulak, 'getMicroserviceTransports').mockImplementation(() => {
        throw new Error('client destroyed');
      });

      try {
        sent.length = 0;
        await Bun.sleep(40);

        const samples = payloadsOf(sent, 'metrics');

        expect(samples.length).toBeGreaterThan(0);

        for (const sample of samples) {
          expect(Object.keys(sample.servers)).toEqual([readable.serverId]);
          expect(sample.readiness).toEqual(sample.servers[readable.serverId].readiness);
        }
      } finally {
        transports.mockRestore();
        both.newer.detach();
        both.older.detach();
      }
    }
  });

  test('when a server detaches the host is told, and the other one keeps reporting and answering', async () => {
    for (const first of ['older', 'newer'] as const) {
      const { channel, sent, listeners, deliver } = fakeChannel();
      const both = attachBoth({ channel, sampleIntervalMs: 5 });
      const [gone, left] = first === 'older' ? [pantry, cellar] : [cellar, pantry];
      const [event, job] = left === pantry ? ['pantry.restocked', 'NightlyRestock'] : ['cellar.opened', 'CellarCount'];

      both[first].detach();
      both[first].detach();

      expect(payloadsOf(sent, 'serverStopped')).toEqual([{ serverId: gone.serverId }]);
      expect(listeners.size).toBe(1);

      const from = sent.length;

      gone.events.emit(gone === pantry ? 'pantry.restocked' : 'cellar.opened', {});
      left.events.emit(event, {});
      deliver(hostMessage('command', { id: 'to-gone', serverId: gone.serverId, command: 'runSchedule', name: job }));
      deliver(hostMessage('command', { id: 'to-left', serverId: left.serverId, command: 'runSchedule', name: job }));
      deliver(hostMessage('command', { id: 'to-recent', command: 'emitEvent', event }));
      await Bun.sleep(40);

      const after = sent.slice(from);

      expect(payloadsOf(after, 'request').map(({ serverId }) => serverId)).toEqual([
        left.serverId,
        left.serverId,
        left.serverId,
      ]);
      expect(payloadsOf(after, 'commandResult').sort((a, b) => a.id.localeCompare(b.id))).toEqual([
        {
          id: 'to-gone',
          ok: false,
          error: {
            name: 'Error',
            message: `No attached server has the id ${JSON.stringify(gone.serverId)}; the command was not run`,
          },
        },
        { id: 'to-left', serverId: left.serverId, ok: true, result: { ran: job } },
        { id: 'to-recent', serverId: left.serverId, ok: true, result: { delivered: true } },
      ]);
      expect(payloadsOf(after, 'metrics').length).toBeGreaterThan(0);

      for (const sample of payloadsOf(after, 'metrics')) {
        expect(Object.keys(sample.servers)).toEqual([left.serverId]);
      }

      const other = first === 'older' ? 'newer' : 'older';

      both[other].detach();

      const silent = sent.length;

      expect(payloadsOf(sent, 'serverStopped')).toEqual([{ serverId: gone.serverId }, { serverId: left.serverId }]);
      expect(listeners.size).toBe(0);

      deliver(hostMessage('command', { id: 'nobody', command: 'runSchedule', name: job }));
      left.events.emit(event, {});
      await Bun.sleep(25);

      expect(sent).toHaveLength(silent);
    }
  });

  test('a stopping server refuses a command sent to it, and the other server still runs its own', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const pantryRuns = NightlyRestock.runs;

    attachBoth({ channel });
    // The hook returned no attachment, so stop() detaches nothing: the agent sees the stopped lifecycle.
    await pantryServer.stop();

    deliver(
      hostMessage('command', {
        id: 'stopped',
        serverId: pantry.serverId,
        command: 'runSchedule',
        name: 'NightlyRestock',
      }),
    );
    deliver(
      hostMessage('command', { id: 'live', serverId: cellar.serverId, command: 'emitEvent', event: 'cellar.opened' }),
    );
    await Bun.sleep(20);

    expect(NightlyRestock.runs).toBe(pantryRuns);
    expect(payloadsOf(sent, 'commandResult')).toEqual([
      {
        id: 'stopped',
        serverId: pantry.serverId,
        ok: false,
        error: { name: 'Error', message: 'The server is stopping; the command was not run' },
      },
      { id: 'live', serverId: cellar.serverId, ok: true, result: { delivered: true } },
    ]);
  });

  test('records the host did not read are counted against the server that produced them', async () => {
    const { channel, sent, drain } = fakeChannel({ stalled: true });

    // hello and the snapshot fill each server's two slots.
    attachBoth({ channel, sampleIntervalMs: 5, maxPendingMessages: 2 });
    pantry.events.emit('pantry.restocked', {});
    pantry.events.emit('pantry.restocked', {});
    pantry.events.emit('pantry.restocked', {});
    await Bun.sleep(30);

    expect(payloadsOf(sent, 'request')).toEqual([]);
    expect(payloadsOf(sent, 'metrics')).toEqual([]);

    drain();

    for (let waited = 0; payloadsOf(sent, 'metrics').length === 0 && waited < 2000; waited += 5) {
      await Bun.sleep(5);
    }

    const [sample] = payloadsOf(sent, 'metrics');
    const sampler = sample.servers[cellar.serverId].dropped!;

    expect(sample.servers[pantry.serverId].dropped).toBe(3);
    // The metrics ticks of the stall, which the most recent server was the one to send.
    expect(sampler).toBeGreaterThan(0);
    expect(sample.dropped).toBe(3 + sampler);
  });
});
