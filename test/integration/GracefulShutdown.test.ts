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
const spawnWorker = (name = 'graceful-worker', bunArgs: string[] = []) =>
  Bun.spawn(['bun', ...bunArgs, fixture(name)], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

const exitCodeWithin = (worker: { exited: Promise<number> }, ms: number): Promise<number | 'still alive'> =>
  Promise.race([worker.exited, Bun.sleep(ms).then(() => 'still alive' as const)]);

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

  test('SIGTERM drains an in-flight HTTP request instead of cutting it', async () => {
    const worker = spawnWorker('signal-drain-server');
    const stdout = tail(worker.stdout);

    await stdout.waitFor('SERVER_STARTED');

    const port = /SERVER_STARTED port=(\d+)/.exec(stdout.text())![1];
    const request = fetch(`http://localhost:${port}/slow`);

    // The signal must land while the handler is still asleep, not while the socket opens
    await Bun.sleep(300);

    worker.kill('SIGTERM');

    // Force-closing active connections severs this socket: the fetch rejects with
    // ECONNRESET instead of resolving - which is exactly how the bug shipped
    const response = await request;

    expect(response.status).toBe(200);
    // The body only exists after the full sleep, so this is also the proof the handler
    // ran to completion rather than being answered early
    expect(await response.text()).toBe('drained');

    const exitCode = await worker.exited;

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

  test('a signal does not hide a leaked handle outside --hot and --watch', async () => {
    const worker = spawnWorker('leaked-handle-worker');
    const stdout = tail(worker.stdout);

    try {
      await stdout.waitFor('SERVER_STARTED');

      worker.kill('SIGINT');

      await stdout.waitFor('WORKER_STOPPED');

      expect(await exitCodeWithin(worker, 1_500)).toBe('still alive');
    } finally {
      worker.kill('SIGKILL');
      await worker.exited;
    }
  }, 20_000);
});

describe('graceful shutdown under a file watcher', () => {
  const EXIT_BOUND_MS = 5_000;

  const FLAGS = ['--hot', '--watch'];

  /** Disposal kills the worker: one that survives a failed assertion would keep its watcher running. */
  const startWorker = async (name: string, bunArgs: string, ready = 'SERVER_STARTED') => {
    const worker = spawnWorker(name, bunArgs.split(' '));
    const stdout = tail(worker.stdout);

    await stdout.waitFor(ready);

    return {
      worker,
      stdout,
      [Symbol.asyncDispose]: async () => {
        worker.kill('SIGKILL');
        await worker.exited;
      },
    };
  };

  test.each([...FLAGS, 'run --hot', 'run --watch'])(
    'bun %s: SIGINT runs the stop hooks and exits 0',
    async (bunArgs) => {
      await using run = await startWorker('graceful-worker', bunArgs);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('WORKER_STOPPED');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: SIGTERM does the same',
    async (flag) => {
      await using run = await startWorker('graceful-worker', flag);

      run.worker.kill('SIGTERM');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('WORKER_STOPPED');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: a rejected stop is logged and still exits 0',
    async (flag) => {
      await using run = await startWorker('rejecting-stop-server', flag);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('LOGGED_ERROR');
      expect(run.stdout.text()).toContain('shutdown failed');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: a handle left behind does not hold the exit',
    async (flag) => {
      await using run = await startWorker('leaked-handle-worker', flag);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('WORKER_STOPPED');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: the exit waits for every server in the process',
    async (flag) => {
      await using run = await startWorker('two-servers-worker', flag);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('QUICK_STOPPED');
      expect(run.stdout.text()).toContain('SLOW_STOPPED');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: a second signal does not wait for the stop',
    async (flag) => {
      await using run = await startWorker('unsettled-stop-worker', flag);

      run.worker.kill('SIGINT');
      await run.stdout.waitFor('WORKER_STOPPING');
      run.worker.kill('SIGINT');

      // The code is Bun's default for the signal (130 under --hot, 0 under --watch): stop() has
      // already removed the handlers by the time the second one lands.
      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).not.toBe('still alive');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: an explicit stop() does not exit',
    async (flag) => {
      await using run = await startWorker('explicit-stop-worker', flag, 'EXPLICIT_STOP_RETURNED');

      expect(await exitCodeWithin(run.worker, 1_500)).toBe('still alive');
      expect(run.stdout.text()).toContain('WORKER_STOPPED');
    },
    20_000,
  );
});
