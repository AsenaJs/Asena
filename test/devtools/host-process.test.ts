import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import {
  hostMessage,
  isDevtoolsAgentMessage,
  type DevtoolsAgentMessage,
  type DevtoolsCommand,
  type DevtoolsCommandResult,
  type DevtoolsHello,
  type DevtoolsMetrics,
  type DevtoolsRequestRecord,
} from '../../lib/devtools/protocol';

const ROOT = join(import.meta.dir, '..', '..');
const CHILD = join(import.meta.dir, 'fixtures', 'host-child.ts');
const PARENT = join(import.meta.dir, 'fixtures', 'host-parent.ts');

const waitFor = async (condition: () => boolean, timeoutMs: number, what: string): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }

    await Bun.sleep(5);
  }
};

const text = (stream: ReadableStream<Uint8Array>) => {
  const decoder = new TextDecoder();
  let output = '';

  void (async () => {
    const reader = stream.getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (value) output += decoder.decode(value, { stream: true });
      if (done) return;
    }
  })();

  return () => output;
};

const lastTick = (output: string): number => Number(output.match(/TICK (\d+)\n(?!.*TICK \d+\n)/s)?.[1] ?? 0);

type Reply = Record<string, any>;

type Entry = { devtools: DevtoolsAgentMessage } | { reply: Reply };

/**
 * A child with an IPC channel, as `asena console` would hold it. Everything the child sends lands in
 * one ordered log, so "nothing after this point" is a position in that log rather than a wait.
 */
const spawnHost = (env: Record<string, string> = {}) => {
  const log: Entry[] = [];
  let commands = 0;
  let pings = 0;

  const child = Bun.spawn({
    cmd: [process.execPath, CHILD],
    // The repo root, so Bun applies its tsconfig (legacy decorators).
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
    ipc(message) {
      if (isDevtoolsAgentMessage(message)) {
        log.push({ devtools: message });
      } else {
        log.push({ reply: message as Reply });
      }
    },
  });

  const devtools = (from = 0): DevtoolsAgentMessage[] =>
    log.slice(from).flatMap((entry) => ('devtools' in entry ? [entry.devtools] : []));

  const ofType = <T>(type: DevtoolsAgentMessage['type'], from = 0): T[] =>
    devtools(from)
      .filter((message) => message.type === type)
      .map((message) => message.payload as T);

  const ask = async (control: Record<string, unknown>): Promise<Reply> => {
    const from = log.length;
    const replies = () => log.slice(from).flatMap((entry) => ('reply' in entry ? [entry.reply] : []));

    child.send({ fixture: control.fixture, ...control });
    await waitFor(() => replies().length > 0, 8_000, `the reply to ${JSON.stringify(control.fixture)}`);

    return replies()[0];
  };

  return {
    child,
    stdout: text(child.stdout),
    stderr: text(child.stderr),
    /** Where the log ends now; pass it as `from` to look only at what comes later. */
    mark: () => log.length,
    devtools,
    hellos: (from?: number) => ofType<DevtoolsHello>('hello', from),
    metrics: (from?: number) => ofType<DevtoolsMetrics>('metrics', from),
    requests: (path: string, from?: number) =>
      ofType<DevtoolsRequestRecord>('request', from).filter((record) => record.path === path),
    results: (id: string, from?: number) =>
      ofType<DevtoolsCommandResult>('commandResult', from).filter((result) => result.id === id),
    ready: () =>
      waitFor(() => log.some((entry) => 'reply' in entry && entry.reply.ready === true), 8_000, 'the child to boot'),
    ask,
    /** A round trip: whatever the child sent while handling earlier messages is in the log by now. */
    settle: async () => {
      pings += 1;
      expect(await ask({ fixture: 'ping', n: pings })).toMatchObject({ pong: pings });
    },
    async command(command: DevtoolsCommand): Promise<{ id: string; result: DevtoolsCommandResult }> {
      commands += 1;

      const id = `command-${commands}`;

      child.send(hostMessage('command', { id, ...command }));
      await waitFor(() => this.results(id).length > 0, 8_000, `the result of ${id}`);

      return { id, result: this.results(id)[0] };
    },
  };
};

describe('devtools agent against a real console host', () => {
  const children: Subprocess[] = [];
  const pids: number[] = [];
  const dirs: string[] = [];

  const host = (env?: Record<string, string>) => {
    const spawned = spawnHost(env);

    children.push(spawned.child);

    return spawned;
  };

  afterEach(() => {
    for (const child of children.splice(0)) {
      child.kill('SIGKILL');
    }

    for (const pid of pids.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }

    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('two servers in one process', () => {
    const second = [{ name: 'default', connected: true }];

    const bootTwo = async () => {
      const app = host({ HOST_CHILD_SERVERS: '2' });

      await app.ready();

      expect(app.devtools().filter((message) => message.type === 'snapshot')).toHaveLength(2);
      expect(app.hellos().map((hello) => hello.transports)).toEqual([[], second]);

      // The first server's event, reported by the second server's agent: the bus is one per process.
      expect(await app.ask({ fixture: 'emit', server: 0, event: 'first.ping' })).toMatchObject({ delivered: true });
      await app.settle();
      expect(app.requests('first.ping')).toHaveLength(1);

      const { id, result } = await app.command({ command: 'emitEvent', event: 'second.ping' });

      await app.settle();
      expect(result).toEqual({ id, ok: true, result: { delivered: true } });
      expect(app.results(id)).toHaveLength(1);
      expect(app.requests('second.ping')).toHaveLength(1);

      await waitFor(() => app.metrics().length > 0, 5_000, 'a metrics sample');

      return app;
    };

    const expectSilenceAfterLastStop = async (app: ReturnType<typeof spawnHost>, server: number) => {
      expect(await app.ask({ fixture: 'stop', server })).toMatchObject({ stopped: server, busEnabled: false });

      const stopped = app.mark();

      app.child.send(hostMessage('command', { id: 'after-stop', command: 'emitEvent', event: 'first.ping' }));
      // Longer than the 1 s metrics interval, and counted in the child: a sampler or a command
      // listener left behind would have spoken by the time it exits.
      app.child.send({ fixture: 'exitAfter', ms: 1_200 });

      expect(await app.child.exited).toBe(0);
      expect(app.devtools(stopped)).toEqual([]);
    };

    test('the most recent server speaks; when it stops, the first one takes over', async () => {
      const app = await bootTwo();

      expect(app.metrics().map((sample) => sample.transports)).toEqual(app.metrics().map(() => second));

      expect(await app.ask({ fixture: 'stop', server: 1 })).toMatchObject({ stopped: 1, busEnabled: true });

      const handedOver = app.mark();

      await waitFor(() => app.metrics(handedOver).length > 0, 5_000, 'a metrics sample from the first server');
      expect(app.metrics(handedOver).map((sample) => sample.transports)).toEqual(app.metrics(handedOver).map(() => []));

      const { id, result } = await app.command({ command: 'emitEvent', event: 'first.ping' });

      await app.settle();
      expect(result).toEqual({ id, ok: true, result: { delivered: true } });
      expect(app.results(id)).toHaveLength(1);
      expect(app.requests('first.ping', handedOver)).toHaveLength(1);

      await expectSilenceAfterLastStop(app, 0);
    }, 20_000);

    test('stopping the first server leaves the most recent one speaking', async () => {
      const app = await bootTwo();

      expect(await app.ask({ fixture: 'stop', server: 0 })).toMatchObject({ stopped: 0, busEnabled: true });

      const stopped = app.mark();

      await waitFor(() => app.metrics(stopped).length > 0, 5_000, 'a metrics sample from the second server');
      expect(app.metrics().map((sample) => sample.transports)).toEqual(app.metrics().map(() => second));

      const { id, result } = await app.command({ command: 'emitEvent', event: 'second.ping' });

      await app.settle();
      expect(result).toEqual({ id, ok: true, result: { delivered: true } });
      expect(app.results(id)).toHaveLength(1);
      expect(app.requests('second.ping', stopped)).toHaveLength(1);

      await expectSilenceAfterLastStop(app, 1);
    }, 20_000);
  });

  test('under NODE_ENV=production the app runs and the console gets nothing', async () => {
    const app = host({ NODE_ENV: 'production' });

    await app.ready();

    expect(await app.ask({ fixture: 'emit', server: 0, event: 'first.ping' })).toMatchObject({ delivered: true });
    app.child.send(hostMessage('command', { id: 'refused', command: 'emitEvent', event: 'first.ping' }));
    await app.settle();

    expect(await app.ask({ fixture: 'state' })).toMatchObject({
      hookCalls: 0,
      busEnabled: false,
      received: ['first.ping'],
    });
    expect(app.devtools()).toEqual([]);
    expect(app.stderr()).toBe('');
  }, 20_000);

  test('malformed host messages are refused or ignored, and the next command still runs', async () => {
    const app = host();

    await app.ready();

    const booted = app.mark();
    const command = (payload: unknown, envelope: Record<string, unknown> = {}) => ({
      v: 1,
      type: 'command',
      payload,
      ...envelope,
    });

    const ignored: unknown[] = [
      'command',
      42,
      true,
      null,
      [],
      ['command', { id: 'in-array' }],
      {},
      command(null),
      command('emitEvent'),
      command(undefined),
      command({ command: 'emitEvent', event: 'first.ping' }),
      command({ id: 7, command: 'emitEvent', event: 'first.ping' }),
      command({ id: null, command: 'emitEvent', event: 'first.ping' }),
      command({ id: 'wrong-version', command: 'emitEvent', event: 'first.ping' }, { v: 2 }),
      command({ id: 'no-version', command: 'emitEvent', event: 'first.ping' }, { v: undefined }),
      command({ id: 'unknown-type', command: 'emitEvent', event: 'first.ping' }, { type: 'shutdown' }),
      command({ id: 'agent-type', ok: true }, { type: 'commandResult' }),
    ];

    const refused: Record<string, Record<string, unknown>> = {
      'no-command': {},
      'unknown-command': { command: 'eval', code: 'process.exit(1)' },
      'numeric-command': { command: 3 },
      'prototype-command': { command: 'constructor' },
      'event-missing': { command: 'emitEvent' },
      'event-number': { command: 'emitEvent', event: 5 },
      'event-null': { command: 'emitEvent', event: null },
      'schedule-missing': { command: 'runSchedule' },
      'schedule-object': { command: 'runSchedule', name: { toString: 'x' } },
      'schedule-unknown': { command: 'runSchedule', name: 'NoSuchJob' },
      'message-no-transport': { command: 'sendMessage', kind: 'message', pattern: 'a.b' },
      'message-no-pattern': { command: 'sendMessage', kind: 'message', transport: 'default' },
      'message-bogus-kind': { command: 'sendMessage', kind: 'bogus', transport: 'default', pattern: 'a.b' },
      'message-no-kind': { command: 'sendMessage', transport: 'default', pattern: 'a.b' },
      'message-unknown-transport': { command: 'sendMessage', kind: 'event', transport: 'nowhere', pattern: 'a.b' },
    };

    for (const message of ignored) {
      app.child.send(message);
    }

    for (const [id, payload] of Object.entries(refused)) {
      app.child.send(command({ id, ...payload }));
    }

    const ids = Object.keys(refused);
    const results = () => app.devtools(booted).filter((message) => message.type === 'commandResult');

    await waitFor(() => results().length >= ids.length, 8_000, 'a result for every command with an id');
    await app.settle();

    const answered = results().map((message) => message.payload as DevtoolsCommandResult);

    expect(answered.map((result) => result.id).sort()).toEqual([...ids].sort());
    expect(answered.filter((result) => result.ok)).toEqual([]);
    expect(
      Object.fromEntries(answered.map((result) => [result.id, 'error' in result && result.error.message])),
    ).toEqual({
      'no-command': 'Unknown command undefined',
      'unknown-command': 'Unknown command "eval"',
      'numeric-command': 'Unknown command 3',
      'prototype-command': 'Unknown command "constructor"',
      'event-missing': 'emitEvent needs a string "event", got undefined',
      'event-number': 'emitEvent needs a string "event", got number',
      'event-null': 'emitEvent needs a string "event", got null',
      'schedule-missing': 'runSchedule needs a string "name", got undefined',
      'schedule-object': 'runSchedule needs a string "name", got object',
      'schedule-unknown': expect.stringContaining('NoSuchJob'),
      'message-no-transport': 'sendMessage needs a string "transport", got undefined',
      'message-no-pattern': 'sendMessage needs a string "pattern", got undefined',
      'message-bogus-kind': 'Unknown sendMessage kind "bogus"',
      'message-no-kind': 'Unknown sendMessage kind undefined',
      'message-unknown-transport': expect.stringContaining('No microservice transport'),
    });
    expect(app.requests('first.ping')).toEqual([]);
    expect(app.child.exitCode).toBeNull();

    const { id, result } = await app.command({ command: 'emitEvent', event: 'first.ping' });

    expect(result).toEqual({ id, ok: true, result: { delivered: true } });
    expect(app.stderr()).toBe('');
  }, 20_000);

  describe('when the host goes away mid-stream', () => {
    test('a disconnected child keeps running and exits 0 on SIGTERM', async () => {
      const app = host({ HOST_CHILD_TICK_MS: '20' });

      await app.ready();
      await waitFor(() => app.requests('first.ping').length >= 3, 8_000, 'records to be streaming');

      app.child.disconnect();

      const ticksAtDisconnect = lastTick(app.stdout());

      await waitFor(() => lastTick(app.stdout()) >= ticksAtDisconnect + 60, 8_000, 'the child to keep ticking');
      expect(app.child.exitCode).toBeNull();

      app.child.kill('SIGTERM');

      expect(await app.child.exited).toBe(0);
      expect(app.stderr()).toBe('');
    }, 20_000);

    test('a child whose host was killed keeps running and exits 0 on SIGTERM', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'asena-devtools-host-'));
      const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : '');

      dirs.push(dir);

      const parent = Bun.spawn({ cmd: [process.execPath, PARENT, dir], cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });

      children.push(parent);

      const parentOut = text(parent.stdout);

      await waitFor(() => /CHILD_PID \d+\n/.test(parentOut()), 8_000, 'the host to report its child');

      const pid = Number(/CHILD_PID (\d+)\n/.exec(parentOut())![1]);

      pids.push(pid);
      await waitFor(() => lastTick(read('stdout')) >= 3, 8_000, 'the child to be streaming');

      parent.kill('SIGKILL');
      await parent.exited;

      const ticksAtKill = lastTick(read('stdout'));

      await waitFor(() => lastTick(read('stdout')) >= ticksAtKill + 60, 8_000, 'the child to outlive its host');

      process.kill(pid, 'SIGTERM');
      await waitFor(() => read('exit') !== '', 8_000, 'the child to exit');

      expect(read('exit')).toBe('0');
      expect(read('stderr')).toBe('');
    }, 20_000);
  });

  test('a host that stops reading costs records, counted in metrics, and no commands', async () => {
    const app = host();
    const dir = mkdtempSync(join(tmpdir(), 'asena-devtools-host-'));
    const doneFile = join(dir, 'flood-done');

    dirs.push(dir);
    await app.ready();

    const records = 6_000;

    app.child.send({ fixture: 'flood', records, batch: 100, doneFile });

    // The stall: this process reads its IPC socket on the thread blocked here, so the child's
    // sends back up until the flood is over.
    const deadline = Date.now() + 8_000;

    while (!existsSync(doneFile)) {
      if (Date.now() > deadline) {
        throw new Error('the child never finished the flood');
      }

      Bun.sleepSync(5);
    }

    const resumed = app.mark();

    await waitFor(
      () => app.metrics(resumed).some((sample) => (sample.dropped ?? 0) > 0),
      8_000,
      'a metrics sample that counts the dropped records',
    );

    const { id, result } = await app.command({ command: 'emitEvent', event: 'first.ping' });

    expect(result).toEqual({ id, ok: true, result: { delivered: true } });

    const dropped = app.metrics().at(-1)!.dropped!;
    const bulk = app
      .devtools()
      .filter((message) => message.type === 'request' && message.payload.path !== 'first.ping');

    expect(dropped).toBeGreaterThan(0);
    expect(bulk.length).toBeLessThan(records);
    expect(app.stderr()).toBe('');
  }, 20_000);
});
