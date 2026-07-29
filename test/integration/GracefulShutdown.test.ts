import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const fixture = (name: string) => join(import.meta.dir, 'fixtures', `${name}.ts`);

/**
 * The end-to-end proof for the lifecycle: a real process, a real signal.
 *
 * Everything else in this suite drives start()/stop() in-process, which cannot show the two
 * things that actually bit a downstream application - that a headless process stays alive once
 * `start()` returns, and that an external SIGTERM reaches the components' stop hooks instead of
 * killing the process mid-step.
 *
 * The unhappy paths are here for a reason. The first version of this lifecycle awaited each
 * teardown step unguarded, so one failing step stranded every step behind it - a database pool
 * and a broker subscription left open because an unrelated socket refused to close. No test
 * caught it; it was found by reading the code. The rule that fell out: every boundary where a
 * failure is *contained* needs a test that makes it fail, not just one that makes it work.
 */
const spawnWorker = (name = 'graceful-worker') =>
  Bun.spawn(['bun', fixture(name)], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

/**
 * Accumulate a stream in the background.
 *
 * One consumer, not two: a ReadableStream can only be read once, so waiting for a marker and
 * then reading the rest has to come off the same buffer.
 */
const tail = (stream: ReadableStream<Uint8Array>) => {
  const decoder = new TextDecoder();
  let output = '';

  const drained = (async () => {
    // Reader loop rather than `for await`: bun's ReadableStream is async-iterable at runtime,
    // but the DOM lib TypeScript resolves here does not declare Symbol.asyncIterator on it.
    const reader = stream.getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (value) output += decoder.decode(value, { stream: true });
      if (done) return;
    }
  })();

  return {
    text: () => output,
    drained,
    waitFor: async (marker: string, timeoutMs = 10_000): Promise<void> => {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        if (output.includes(marker)) return;

        await Bun.sleep(10);
      }

      throw new Error(`never saw '${marker}'. Got:\n${output}`);
    },
  };
};

describe('graceful shutdown', () => {
  test('a headless worker stays alive after start() returns', async () => {
    const worker = spawnWorker();
    const stdout = tail(worker.stdout);

    try {
      await stdout.waitFor('SERVER_STARTED');

      expect(stdout.text()).toContain('WORKER_STARTED');

      // The hook returned and start() resolved - yet the process is still here, because the
      // server holds the event loop open. Without that a headless worker would exit right now.
      await Bun.sleep(200);
      expect(worker.killed).toBe(false);
      expect(worker.exitCode).toBeNull();
    } finally {
      worker.kill('SIGKILL');
      await worker.exited;
    }
  }, 20_000);

  test('SIGTERM runs the stop hooks and exits cleanly', async () => {
    const worker = spawnWorker();
    const stdout = tail(worker.stdout);

    await stdout.waitFor('SERVER_STARTED');

    // Long enough to be mid-loop rather than in the first tick.
    await Bun.sleep(120);

    worker.kill('SIGTERM');

    const exitCode = await worker.exited;

    await stdout.drained;

    expect(stdout.text()).toContain('WORKER_STOPPED');
    // Cooperative, not killed: the loop ran several ticks and the hook observed them.
    expect(stdout.text()).toMatch(/WORKER_STOPPED ticks=[1-9]\d*/);
    expect(exitCode).toBe(0);
  }, 20_000);

  test('SIGINT does the same', async () => {
    const worker = spawnWorker();
    const stdout = tail(worker.stdout);

    await stdout.waitFor('SERVER_STARTED');

    worker.kill('SIGINT');

    const exitCode = await worker.exited;

    await stdout.drained;

    expect(stdout.text()).toContain('WORKER_STOPPED');
    expect(exitCode).toBe(0);
  }, 20_000);

  test('a throwing stop hook does not strand the components behind it', async () => {
    const worker = spawnWorker('failing-stop-worker');
    const stdout = tail(worker.stdout);

    await stdout.waitFor('SERVER_STARTED');

    worker.kill('SIGTERM');

    const exitCode = await worker.exited;

    await stdout.drained;

    // BrokenTeardown throws; RegisteredEarlier stops after it because stop order is the reverse
    // of start order. Seeing its line is the proof that one component failing to let go does not
    // end the shutdown - and the process still exits cleanly.
    expect(stdout.text()).toContain('EARLIER_STOPPED');
    expect(exitCode).toBe(0);
  }, 20_000);

  test('forceExitAfter ends a process a stop hook will not let go of', async () => {
    const worker = spawnWorker('hanging-stop-worker');
    const stdout = tail(worker.stdout);

    await stdout.waitFor('SERVER_STARTED');

    const startedAt = Date.now();

    worker.kill('SIGTERM');

    const exitCode = await worker.exited;
    const elapsed = Date.now() - startedAt;

    await stdout.drained;

    expect(stdout.text()).toContain('STUCK_STOPPING');
    // Non-zero: this was not a clean exit and the exit code should not pretend otherwise.
    expect(exitCode).not.toBe(0);
    // The 1000ms deadline, not the 5000ms default hook timeout and not never.
    expect(elapsed).toBeLessThan(5_000);
  }, 20_000);
});
