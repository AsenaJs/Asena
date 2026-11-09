import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { attachDevtoolsAgent, type DevtoolsChannel } from '../../lib/devtools/agent';
import type { DevtoolsAttachment, DevtoolsServerContext } from '../../lib/devtools/context';
import { buildDevtoolsSnapshot } from '../../lib/devtools/snapshot';
import { hostMessage, type DevtoolsAgentMessage, type DevtoolsCommand } from '../../lib/devtools/protocol';
import { computeReadiness } from '../../lib/server/health/readiness';
import { AsenaServerFactory, type AsenaServer } from '../../lib/server';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import manifest from '../../package.json';
import { installDevtoolsHook } from './helpers';
import { consoleAppComponents, NightlyRestock, PantryEvents } from './fixtures/console-app';

const fakeChannel = () => {
  const sent: DevtoolsAgentMessage[] = [];
  const listeners = new Set<(message: unknown) => void>();
  const channel: DevtoolsChannel = {
    send: (message) => {
      sent.push(message);
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

    attachment = attachDevtoolsAgent(context, { channel });

    expect(sent.map((message) => message.type)).toEqual(['hello', 'snapshot']);
    expect(sent.every((message) => message.v === 1)).toBe(true);
    expect(payloadsOf(sent, 'hello')).toEqual([
      {
        coreVersion: manifest.version,
        adapter: null,
        port: null,
        pid: process.pid,
        transports: [{ name: 'default', connected: true }],
      },
    ]);
    expect(payloadsOf(sent, 'snapshot')).toEqual([buildDevtoolsSnapshot(context.container, context)]);
  });

  test('samples metrics on the interval, readiness by the health probe rule', async () => {
    const { channel, sent } = fakeChannel();

    attachment = attachDevtoolsAgent(context, { channel, sampleIntervalMs: 10 });

    for (let waited = 0; payloadsOf(sent, 'metrics').length < 2 && waited < 2000; waited += 10) {
      await Bun.sleep(10);
    }

    const metrics = payloadsOf(sent, 'metrics');

    expect(metrics.length).toBeGreaterThanOrEqual(2);

    for (const sample of metrics) {
      expect(sample.rss).toBeGreaterThan(0);
      expect(sample.heapUsed).toBeGreaterThan(0);
      expect(sample.heapTotal).toBeGreaterThanOrEqual(sample.heapUsed);
      expect(sample.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(sample.eventLoopLagMs).toBeGreaterThanOrEqual(0);
      expect(sample.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(sample.transports).toEqual([{ name: 'default', connected: true }]);
    }

    expect(metrics.at(-1)!.readiness).toEqual(
      computeReadiness(context.lifecycle.state, context.ulak.getMicroserviceTransports()),
    );
    expect(metrics.at(-1)!.readiness).toEqual({ status: 'up', transports: { default: 'connected' } });
  });

  test('answers commands through the real dispatch paths, with the correlation id', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const command = (id: string, body: DevtoolsCommand) => deliver(hostMessage('command', { id, ...body }));
    const runsBefore = NightlyRestock.runs;
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});

    attachment = attachDevtoolsAgent(context, { channel });

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

    expect(Object.keys(results).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(results.c1).toEqual({ id: 'c1', ok: true, result: { ran: 'NightlyRestock' } });
    expect(NightlyRestock.runs).toBe(runsBefore + 1);
    expect(results.c2).toEqual({ id: 'c2', ok: true, result: { delivered: true } });
    expect(PantryEvents.received.at(-1)).toEqual({ item: 'flour' });
    expect(results.c3).toEqual({ id: 'c3', ok: true, result: { reply: { item: 'rice', count: 3 } } });
    // The @Catch answered, so the reply is its return value, exactly as for any other caller.
    expect(results.c4).toEqual({ id: 'c4', ok: true, result: { reply: { reserved: false } } });
    expect(results.c5).toMatchObject({ id: 'c5', ok: false, error: { name: 'UlakError' } });
    expect(results.c6).toEqual({ id: 'c6', ok: false, error: { name: 'Error', message: 'audit failed' } });
    expect(results.c7).toEqual({ id: 'c7', ok: true, result: { emitted: true } });
    expect(results.c8).toEqual({
      id: 'c8',
      ok: false,
      error: { name: 'Error', message: 'Unknown command "teleport"' },
    });
  });

  // A version-skewed or buggy host must never take the app down: before, `payload: null` became an
  // unhandled rejection and a command without an id still ran.
  test('ignores a host message whose payload is not a command with an id', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const runsBefore = NightlyRestock.runs;

    attachment = attachDevtoolsAgent(context, { channel });
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

    attachment = attachDevtoolsAgent(context, { channel });

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

    expect(results).toEqual([
      { id: 'k1', ok: false, error: { name: 'Error', message: 'Unknown sendMessage kind "bogus"' } },
      { id: 'k2', ok: false, error: { name: 'Error', message: 'Unknown sendMessage kind undefined' } },
    ]);
  });

  // Two servers in one process, or a `--hot` reload that leaves the previous one running, share one
  // IPC channel: a command must run once, not once per attachment.
  test('only the most recent attachment answers commands; the previous one takes over when it detaches', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const runsBefore = NightlyRestock.runs;
    const older = attachDevtoolsAgent(context, { channel });
    const newer = attachDevtoolsAgent(context, { channel });

    try {
      deliver(hostMessage('command', { id: 'once', command: 'runSchedule', name: 'NightlyRestock' }));
      await Bun.sleep(20);

      expect(NightlyRestock.runs).toBe(runsBefore + 1);
      expect(payloadsOf(sent, 'commandResult').map((result) => result.id)).toEqual(['once']);

      newer.detach();
      deliver(hostMessage('command', { id: 'after', command: 'runSchedule', name: 'NightlyRestock' }));
      await Bun.sleep(20);

      expect(NightlyRestock.runs).toBe(runsBefore + 2);
      expect(payloadsOf(sent, 'commandResult').map((result) => result.id)).toEqual(['once', 'after']);
    } finally {
      newer.detach();
      older.detach();
    }
  });

  // Teardown closes pools, transports and ulak before the agent detaches; a command run then hits a
  // half-stopped app, and runNow would even run a job the cron runner has already stopped.
  test('refuses commands once the server is stopping, without running them', async () => {
    const { channel, sent, deliver } = fakeChannel();
    const runsBefore = NightlyRestock.runs;

    attachment = attachDevtoolsAgent(context, { channel });
    await server.stop();
    deliver(hostMessage('command', { id: 'late', command: 'runSchedule', name: 'NightlyRestock' }));
    await Bun.sleep(20);

    expect(NightlyRestock.runs).toBe(runsBefore);
    expect(payloadsOf(sent, 'commandResult')).toEqual([
      { id: 'late', ok: false, error: { name: 'Error', message: 'The server is stopping; the command was not run' } },
    ]);
  });

  test('forwards the records the bus closes as request messages', async () => {
    const { channel, sent, deliver } = fakeChannel();

    attachment = attachDevtoolsAgent(context, { channel });
    deliver(hostMessage('command', { id: 'r1', command: 'emitEvent', event: 'pantry.restocked', data: {} }));
    deliver(hostMessage('command', { id: 'r2', command: 'runSchedule', name: 'NightlyRestock' }));
    await Bun.sleep(10);

    expect(
      payloadsOf(sent, 'request')
        .map(({ method, path, status, answeredBy }) => ({ method, path, status, answeredBy }))
        .sort((a, b) => a.method.localeCompare(b.method)),
    ).toEqual([
      {
        method: '@On',
        path: 'pantry.restocked',
        status: 200,
        answeredBy: { kind: 'controller', name: 'PantryEvents.restocked' },
      },
      {
        method: '@Schedule',
        path: 'NightlyRestock',
        status: 200,
        answeredBy: { kind: 'controller', name: 'NightlyRestock.execute' },
      },
    ]);
  });

  test('detach releases the IPC listener, the sampler and the bus subscription', async () => {
    const { channel, sent, listeners, deliver } = fakeChannel();

    attachDevtoolsAgent(context, { channel, sampleIntervalMs: 5 }).detach();

    const countAfterDetach = sent.length;

    deliver(hostMessage('command', { id: 'late', command: 'emitEvent', event: 'pantry.restocked' }));
    await Bun.sleep(25);

    expect(listeners.size).toBe(0);
    expect(sent.length).toBe(countAfterDetach);
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
