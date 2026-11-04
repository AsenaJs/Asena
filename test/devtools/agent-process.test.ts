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
});
