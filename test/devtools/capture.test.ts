import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { captureRequestOutput } from '../../lib/devtools/capture';
import { DevtoolsBus } from '../../lib/devtools/DevtoolsBus';
import { attachDevtoolsAgent } from '../../lib/devtools/agent';
import type { DevtoolsServerContext } from '../../lib/devtools/context';
import type { DevtoolsRequestRecord, DevtoolsRequestStep } from '../../lib/devtools/protocol';
import { AsenaServerFactory } from '../../lib/server';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { installDevtoolsHook } from './helpers';
import { consoleAppComponents } from './fixtures/console-app';

const METHODS = ['log', 'info', 'debug', 'trace', 'warn', 'error'] as const;

type Sink = { calls: Array<[string, unknown[]]>; restore: () => void };

// Swallows every write so the test output stays clean, and records what the "real" stream received.
const muteOutput = (): Sink => {
  const calls: Sink['calls'] = [];
  const consoleBefore = Object.fromEntries(METHODS.map((method) => [method, console[method]]));
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;

  for (const method of METHODS) {
    console[method] = (...args: unknown[]) => {
      calls.push([`console.${method}`, args]);
    };
  }

  process.stdout.write = ((...args: unknown[]) => {
    calls.push(['stdout', args]);

    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((...args: unknown[]) => {
    calls.push(['stderr', args]);

    return true;
  }) as typeof process.stderr.write;

  return {
    calls,
    restore: () => {
      Object.assign(console, consoleBefore);
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
    },
  };
};

const outputFunctions = (): Record<string, unknown> => ({
  ...Object.fromEntries(METHODS.map((method) => [method, console[method]])),
  stdout: process.stdout.write,
  stderr: process.stderr.write,
});

const answer: DevtoolsRequestStep = { kind: 'controller', name: 'Shelf.list' };

describe('request-scoped output capture', () => {
  let sink: Sink;
  let bus: DevtoolsBus;
  let records: DevtoolsRequestRecord[];
  let release: () => void;

  const logsOf = (path: string) =>
    records.find((record) => record.path === path)!.logs?.map(({ stream, text }) => ({ stream, text }));

  beforeEach(() => {
    sink = muteOutput();
    bus = new DevtoolsBus();
    bus.enable();
    records = [];
    bus.subscribe((record) => records.push(record));
    release = captureRequestOutput(bus);
  });

  afterEach(() => {
    release();
    sink.restore();
  });

  test('a write lands on the record in scope and only that one, also when two requests overlap', async () => {
    const handler = async (label: string) => {
      console.log(`${label} start`);
      await Bun.sleep(6);
      process.stdout.write(`${label} middle\n`);
      await Bun.sleep(6);
      console.error(`${label} end`);
    };
    const first = bus.open('GET', '/a');
    const second = bus.open('GET', '/b');
    const runFirst = bus.run(first, () => handler('a'));

    await Bun.sleep(2);

    const runSecond = bus.run(second, () => handler('b'));

    await Promise.all([runFirst, runSecond]);
    bus.close(first, 200, answer);
    bus.close(second, 200, answer);

    expect(logsOf('/a')).toEqual([
      { stream: 'stdout', text: 'a start\n' },
      { stream: 'stdout', text: 'a middle\n' },
      { stream: 'stderr', text: 'a end\n' },
    ]);
    expect(logsOf('/b')).toEqual([
      { stream: 'stdout', text: 'b start\n' },
      { stream: 'stdout', text: 'b middle\n' },
      { stream: 'stderr', text: 'b end\n' },
    ]);

    for (const record of records) {
      for (const log of record.logs!) {
        expect(log.at).toBeGreaterThanOrEqual(record.startedAt);
      }
    }
  });

  test('a write outside any request scope is not captured, and a quiet record carries no logs', () => {
    console.log('boot banner');
    process.stdout.write('outside\n');

    const quiet = bus.open('GET', '/quiet');

    bus.run(quiet, () => undefined);
    bus.close(quiet, 204, answer);

    expect(records[0]).not.toHaveProperty('logs');
    expect(records[0]).not.toHaveProperty('logsTruncated');
    expect(sink.calls).toEqual([
      ['console.log', ['boot banner']],
      ['stdout', ['outside\n']],
    ]);
  });

  test('async continuations count until close, writes after close are not attached', async () => {
    const record = bus.open('GET', '/late');
    let afterClose!: Promise<void>;

    await bus.run(record, async () => {
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log('timer before close');
          resolve();
        }, 5),
      );
      await Promise.resolve().then(() => process.stderr.write('microtask before close\n'));
      afterClose = new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log('timer after close');
          resolve();
        }, 20),
      );
    });
    bus.close(record, 200, answer);
    await afterClose;

    expect(logsOf('/late')).toEqual([
      { stream: 'stdout', text: 'timer before close\n' },
      { stream: 'stderr', text: 'microtask before close\n' },
    ]);
    expect(record.logs.map(({ text }) => text)).not.toContain('timer after close\n');
    expect(sink.calls.at(-1)).toEqual(['console.log', ['timer after close']]);
  });

  test('stops at 100 entries and marks the record truncated', () => {
    const record = bus.open('GET', '/chatty');

    bus.run(record, () => {
      for (let line = 0; line < 101; line += 1) {
        console.log(`line ${line}`);
      }
    });
    bus.close(record, 200, answer);

    expect(records[0].logs).toHaveLength(100);
    expect(records[0].logs!.at(-1)!.text).toBe('line 99\n');
    expect(records[0].logsTruncated).toBe(true);
    expect(sink.calls).toHaveLength(101);
  });

  test('stops at 16 KiB of text, keeping the part of the write that fits', () => {
    const record = bus.open('GET', '/bulky');
    const block = 'x'.repeat(10 * 1024);

    bus.run(record, () => {
      process.stdout.write(block);
      process.stdout.write(block);
      console.log('small, but after the cap');
    });
    bus.close(record, 200, answer);

    expect(records[0].logs!.map(({ text }) => text.length)).toEqual([10 * 1024, 6 * 1024]);
    expect(records[0].logsTruncated).toBe(true);
  });

  test('covers every console method and both streams, on the stream Bun prints them to', () => {
    const record = bus.open('GET', '/all');

    bus.run(record, () => {
      console.log('plain', 42);
      console.info('%s=%d', 'n', 7);
      console.debug('debug');
      console.trace('traced');
      console.warn('careful');
      console.error('failed');
      process.stdout.write(new TextEncoder().encode('bytes\n'));
      process.stderr.write('raw\n');
    });
    bus.close(record, 200, answer);

    const logs = logsOf('/all')!;

    expect(logs.map(({ stream }) => stream)).toEqual([
      'stdout',
      'stdout',
      'stdout',
      'stdout',
      'stderr',
      'stderr',
      'stdout',
      'stderr',
    ]);
    expect(logs.map(({ text }) => text)).toEqual([
      'plain 42\n',
      'n=7\n',
      'debug\n',
      expect.stringMatching(/^traced\n {6}at .*capture\.test\.ts/),
      'careful\n',
      'failed\n',
      'bytes\n',
      'raw\n',
    ]);
  });

  test('the original stream still receives every write, with the same arguments', () => {
    const bytes = new TextEncoder().encode('bytes\n');
    const record = bus.open('GET', '/forward');
    const callback = () => undefined;

    bus.run(record, () => {
      console.log('plain', 42);
      console.trace('traced');
      process.stdout.write(bytes);
      process.stderr.write('raw\n', 'utf8', callback);
    });
    bus.close(record, 200, answer);

    expect(sink.calls).toEqual([
      ['console.log', ['plain', 42]],
      ['console.trace', ['traced']],
      ['stdout', [bytes]],
      ['stderr', ['raw\n', 'utf8', callback]],
    ]);
  });

  test('captures a console line once even where console.log writes through process.stdout.write', () => {
    release();
    console.log = (...args: unknown[]) => {
      process.stdout.write(`${args.join(' ')}\n`);
    };
    release = captureRequestOutput(bus);

    const record = bus.open('GET', '/once');

    bus.run(record, () => console.log('once'));
    bus.close(record, 200, answer);

    expect(logsOf('/once')).toEqual([{ stream: 'stdout', text: 'once\n' }]);
    expect(sink.calls).toEqual([['stdout', ['once\n']]]);
  });

  test('a value that cannot be rendered still reaches the original stream', () => {
    const hostile = {
      [Bun.inspect.custom]() {
        throw new Error('no inspection');
      },
    };
    const record = bus.open('GET', '/hostile');

    bus.run(record, () => {
      console.log(hostile);
      console.log('still captured');
    });
    bus.close(record, 200, answer);

    expect(logsOf('/hostile')).toEqual([{ stream: 'stdout', text: 'still captured\n' }]);
    expect(sink.calls).toEqual([
      ['console.log', [hostile]],
      ['console.log', ['still captured']],
    ]);
  });

  test('release puts the original functions back, and leaves a later patch alone', () => {
    const patched = outputFunctions();

    release();

    const muted = outputFunctions();

    expect(muted).not.toEqual(patched);

    release = captureRequestOutput(bus);

    const later = () => undefined;

    console.warn = later;
    release();

    const restored = outputFunctions();

    expect(restored.warn).toBe(later);
    restored.warn = muted.warn;
    expect(restored).toEqual(muted);
  });
});

describe('output capture is installed only by an attached agent', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  const boot = async () => {
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: consoleAppComponents,
      shutdown: { signals: false },
    });

    await server.start();

    return server;
  };

  test('nothing is patched without the console hook', async () => {
    const before = outputFunctions();
    const server = await boot();

    try {
      expect(outputFunctions()).toEqual(before);
    } finally {
      await server.stop();
    }
  });

  test('nothing is patched when the hook is set but the process has no IPC channel', async () => {
    const before = outputFunctions();

    restore = installDevtoolsHook(attachDevtoolsAgent, { ipc: false });

    const server = await boot();

    try {
      expect(outputFunctions()).toEqual(before);
    } finally {
      await server.stop();
    }
  });

  test('the attached agent patches the streams and the server stop restores them', async () => {
    const before = outputFunctions();

    restore = installDevtoolsHook(attachDevtoolsAgent);

    const server = await boot();
    const attached = outputFunctions();

    await server.stop();

    expect(attached.log).not.toBe(before.log);
    expect(attached.stdout).not.toBe(before.stdout);
    expect(attached.stderr).not.toBe(before.stderr);
    expect(outputFunctions()).toEqual(before);
  });
});
