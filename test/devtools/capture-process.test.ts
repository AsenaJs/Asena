import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import {
  hostMessage,
  isDevtoolsAgentMessage,
  type DevtoolsAgentMessage,
  type DevtoolsRequestRecord,
} from '../../lib/devtools/protocol';

const ROOT = join(import.meta.dir, '..', '..');
const fixture = (name: string) => join(import.meta.dir, 'fixtures', name);

const waitFor = async (condition: () => boolean, timeoutMs: number, what: string): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }

    await Bun.sleep(10);
  }
};

describe('request-scoped output capture on the real Bun runtime', () => {
  let child: Subprocess<'ignore', 'pipe', 'pipe'> | undefined;

  afterEach(() => {
    child?.kill('SIGKILL');
    child = undefined;
  });

  // Why the capture patches console.* and the stream writes separately: on Bun no call reaches another.
  test('no console method goes through process.stdout/stderr.write, and trace prints to stdout', async () => {
    let report: Record<string, string[]> | undefined;

    child = Bun.spawn({
      cmd: [process.execPath, fixture('stream-probe.ts')],
      cwd: ROOT,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      ipc(message) {
        report = message as Record<string, string[]>;
      },
    });

    expect(await child.exited).toBe(0);

    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);

    expect(report).toEqual({
      'console.log': ['console.log'],
      'console.info': ['console.info'],
      'console.debug': ['console.debug'],
      'console.trace': ['console.trace'],
      'console.warn': ['console.warn'],
      'console.error': ['console.error'],
      'process.stdout.write': ['process.stdout.write'],
      'process.stderr.write': ['process.stderr.write'],
    });
    expect(stdout.match(/^probe \w+$/gm)).toEqual([
      'probe log',
      'probe info',
      'probe debug',
      'probe trace',
      'probe stdout',
    ]);
    expect(stderr.match(/^probe \w+$/gm)).toEqual(['probe warn', 'probe error', 'probe stderr']);
  }, 20_000);

  test('a dispatch record carries each write once, verbatim, and the streams still get every byte', async () => {
    const received: DevtoolsAgentMessage[] = [];
    let outsideWritten = false;
    let inspected: number | undefined;

    child = Bun.spawn({
      cmd: [process.execPath, fixture('log-capture-child.ts')],
      cwd: ROOT,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      ipc(message) {
        const signal = message as { fixture?: string; count?: number };

        if (isDevtoolsAgentMessage(message)) {
          received.push(message);
        } else if (signal.fixture === 'outside-written') {
          outsideWritten = true;
        } else if (signal.fixture === 'inspected') {
          inspected = signal.count;
        }
      },
    });

    const recordOf = () =>
      received.find((message) => message.type === 'request')?.payload as DevtoolsRequestRecord | undefined;

    await waitFor(() => outsideWritten, 10_000, 'the child to boot');
    child.send(hostMessage('command', { id: 'run-1', command: 'runSchedule', name: 'ChattyJob' }));
    await waitFor(() => recordOf() !== undefined, 5_000, 'the request record');
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);

    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const record = recordOf()!;
    const logs = record.logs!;

    expect(record).toMatchObject({ method: '@Schedule', path: 'ChattyJob', status: 200 });
    expect(record).not.toHaveProperty('logsTruncated');
    expect(logs.map(({ stream, text }) => [stream, text.split('\n')[0]])).toEqual([
      ['stdout', 'log line 1'],
      ['stdout', 'info line'],
      ['stdout', 'debug line'],
      ['stdout', 'trace line'],
      ['stderr', 'warn line'],
      ['stderr', expect.stringContaining('|')],
      ['stdout', '{'],
      ['stdout', expect.stringMatching(/^┌/)],
      ['stderr', 'assert line'],
      ['stdout', 'inspect line custom #1'],
      ['stdout', 'raw stdout'],
      ['stderr', 'raw stderr'],
      ['stdout', 'after await'],
    ]);
    expect(logs[5].text).toContain('error: boom\n');
    expect(logs[5].text).toContain('log-capture-child.ts');
    expect(logs[6].text).toContain('dir: "line"');
    expect(logs[7].text).toContain('table');
    expect(inspected).toBe(1);

    const written = (stream: 'stdout' | 'stderr') =>
      logs
        .filter((log) => log.stream === stream)
        .map(({ text }) => text)
        .join('');

    // The one difference: what console.trace prints also lists the capture wrapper's own frame.
    const wrapperFrame = /^ {6}at captured \(.*lib\/devtools\/capture\.ts:\d+:\d+\)\n/gm;

    expect(stdout.match(wrapperFrame)).toHaveLength(1);
    expect(stdout.replace(wrapperFrame, '')).toBe(`outside console\noutside write\n${written('stdout')}`);
    expect(stderr).toBe(written('stderr'));
  }, 20_000);

  test('a console wrapper the app installs before start redacts the record as it redacts the terminal', async () => {
    const received: DevtoolsAgentMessage[] = [];
    let ready = false;

    child = Bun.spawn({
      cmd: [process.execPath, fixture('redaction-child.ts')],
      cwd: ROOT,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      ipc(message) {
        if (isDevtoolsAgentMessage(message)) {
          received.push(message);
        } else if ((message as { fixture?: string }).fixture === 'ready') {
          ready = true;
        }
      },
    });

    const recordOf = () =>
      received.find((message) => message.type === 'request')?.payload as DevtoolsRequestRecord | undefined;

    await waitFor(() => ready, 10_000, 'the child to boot');
    child.send(hostMessage('command', { id: 'run-1', command: 'runSchedule', name: 'TokenJob' }));
    await waitFor(() => recordOf() !== undefined, 5_000, 'the request record');
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);

    const stdout = await new Response(child.stdout).text();

    expect(stdout).toContain('issued token=[redacted] for shelf\n');
    expect(stdout).not.toContain('SECRET');
    expect(recordOf()!.logs).toEqual([
      { stream: 'stdout', text: 'issued token=[redacted] for shelf\n', at: expect.any(Number) },
    ]);
  }, 20_000);
});
