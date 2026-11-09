import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import { hostMessage, isDevtoolsAgentMessage, type DevtoolsAgentMessage } from '../../lib/devtools/protocol';

const ROOT = join(import.meta.dir, '..', '..');
const CHILD = join(import.meta.dir, 'fixtures', 'console-child.ts');

const waitFor = async (condition: () => boolean, timeoutMs: number, what: string): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }

    await Bun.sleep(10);
  }
};

// The spike's child hung after SIGTERM until SIGKILL: a process.on('message') listener holds the event loop open.
describe('devtools agent in an IPC child process', () => {
  let child: Subprocess | undefined;

  afterEach(() => {
    child?.kill('SIGKILL');
    child = undefined;
  });

  test('announces itself, answers a command, and lets the child exit after SIGTERM', async () => {
    const received: DevtoolsAgentMessage[] = [];

    // cwd is the repo root so Bun applies its tsconfig (legacy decorators), as the console host will do.
    child = Bun.spawn({
      cmd: [process.execPath, CHILD],
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      ipc(message) {
        if (isDevtoolsAgentMessage(message)) {
          received.push(message);
        }
      },
    });

    const types = () => received.map((message) => message.type);

    await waitFor(() => types().includes('snapshot'), 10_000, 'hello and snapshot');
    expect(types().slice(0, 2)).toEqual(['hello', 'snapshot']);
    expect(received[0].payload).toMatchObject({ pid: child.pid, adapter: null, port: null });

    child.send(hostMessage('command', { id: 'run-1', command: 'runSchedule', name: 'NightlyRestock' }));
    await waitFor(() => types().includes('commandResult'), 5_000, 'the command result');
    expect(received.find((message) => message.type === 'commandResult')!.payload).toEqual({
      id: 'run-1',
      ok: true,
      result: { ran: 'NightlyRestock' },
    });

    const signalledAt = performance.now();

    child.kill('SIGTERM');

    const exited = await Promise.race([child.exited, Bun.sleep(2_000).then(() => 'still running' as const)]);

    expect(exited).toBe(0);
    expect(performance.now() - signalledAt).toBeLessThan(2_000);
  }, 20_000);

  // The agent counts a message as pending until process.send's callback fires; if Bun never called
  // it, telemetry would stop for good after the first 1000 messages.
  test('a host that keeps reading gets every record, past the pending-message bound', async () => {
    const received: DevtoolsAgentMessage[] = [];
    const commands = 1500;

    child = Bun.spawn({
      cmd: [process.execPath, CHILD],
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      ipc(message) {
        if (isDevtoolsAgentMessage(message)) {
          received.push(message);
        }
      },
    });

    const ofType = (type: DevtoolsAgentMessage['type']) => received.filter((message) => message.type === type);

    await waitFor(() => ofType('snapshot').length > 0, 10_000, 'the snapshot');

    // In batches: one burst of 1500 outruns the pipe, and dropping then is the point of the bound.
    for (let sent = 0; sent < commands; sent += 100) {
      for (let index = sent; index < sent + 100; index += 1) {
        child.send(hostMessage('command', { id: `e${index}`, command: 'emitEvent', event: 'pantry.restocked' }));
      }

      await waitFor(() => ofType('commandResult').length === sent + 100, 10_000, `results up to ${sent + 100}`);
    }

    const metricsBefore = ofType('metrics').length;

    await waitFor(() => ofType('metrics').length > metricsBefore, 5_000, 'a metrics sample after the burst');

    expect(ofType('request').length).toBe(commands);
    expect(ofType('metrics').every((message) => (message.payload as { dropped?: number }).dropped === undefined)).toBe(
      true,
    );
  }, 30_000);
});
