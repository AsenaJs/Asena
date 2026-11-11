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
const spawnWorker = (name = 'graceful-worker', bunArgs: string[] = [], env: Record<string, string> = {}) =>
  Bun.spawn(['bun', ...bunArgs, fixture(name)], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
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
    // end the shutdown. Exit 0 would tell a supervisor that everything was released.
    expect(stdout.text()).toContain('EARLIER_STOPPED');
    expect(exitCode).toBe(1);
  }, 20_000);

  test('a rejected stop is logged and exits 1', async () => {
    const worker = spawnWorker('rejecting-stop-server');
    const stdout = tail(worker.stdout);

    try {
      await stdout.waitFor('SERVER_STARTED');

      worker.kill('SIGTERM');

      expect(await exitCodeWithin(worker, 5_000)).toBe(1);
      await stdout.drained;
      expect(stdout.text()).toContain('shutdown failed');
    } finally {
      worker.kill('SIGKILL');
      await worker.exited;
    }
  }, 20_000);

  test('a failed shutdown keeps the non-zero exit code the app already set', async () => {
    const worker = spawnWorker('failing-stop-worker', [], { APP_EXIT_CODE: '7' });
    const stdout = tail(worker.stdout);

    await stdout.waitFor('SERVER_STARTED');

    worker.kill('SIGTERM');

    expect(await worker.exited).toBe(7);
  }, 20_000);

  // The app that calls stop() itself owns its process: it reads the outcome from the promise.
  test('an explicit stop() with a throwing stop hook leaves the exit code alone', async () => {
    const worker = spawnWorker('failing-stop-worker', [], { EXPLICIT_STOP: '1' });
    const stdout = tail(worker.stdout);

    const exitCode = await worker.exited;

    await stdout.drained;

    expect(stdout.text()).toContain('EARLIER_STOPPED');
    expect(stdout.text()).toContain('EXPLICIT_STOP_RESOLVED');
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
  const startWorker = async (name: string, bunArgs: string, ready = 'SERVER_STARTED', env?: Record<string, string>) => {
    const worker = spawnWorker(name, bunArgs.split(' '), env);
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

  // Exit 0 would tell a supervisor or a CI step that the shutdown was clean.
  test.each(FLAGS)(
    'bun %s: a rejected stop is logged and exits 1',
    async (flag) => {
      await using run = await startWorker('rejecting-stop-server', flag);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(1);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('LOGGED_ERROR');
      expect(run.stdout.text()).toContain('shutdown failed');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: a throwing stop hook exits 1 after the hooks behind it ran',
    async (flag) => {
      await using run = await startWorker('failing-stop-worker', flag);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(1);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('EARLIER_STOPPED');
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

  // stop() removes a server's signal handlers, so only the other server reacts to the signal.
  test.each(FLAGS)(
    'bun %s: the exit waits for an explicit stop() still running elsewhere in the process',
    async (flag) => {
      await using run = await startWorker('explicit-and-signal-worker', flag, 'EXPLICIT_STOPPING');

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('SIGNAL_STOPPED');
      expect(run.stdout.text()).toContain('EXPLICIT_STOPPED');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: the exit waits for another async listener of the signal',
    async (flag) => {
      await using run = await startWorker('foreign-listener-worker', flag);

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('WORKER_STOPPED');
      expect(run.stdout.text()).toContain('FOREIGN_FLUSHED');
    },
    20_000,
  );

  test.each(FLAGS)(
    'bun %s: another listener that never settles holds the exit for shutdown.timeout at most',
    async (flag) => {
      await using run = await startWorker('foreign-listener-worker', flag, 'SERVER_STARTED', { HOLD: '1' });
      const signalledAt = Date.now();

      run.worker.kill('SIGINT');

      expect(await exitCodeWithin(run.worker, EXIT_BOUND_MS)).toBe(0);
      expect(Date.now() - signalledAt).toBeGreaterThanOrEqual(900);
      await run.stdout.drained;
      expect(run.stdout.text()).toContain('WORKER_STOPPED');
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

describe('a second signal while a signal stop runs', () => {
  // A drain that hangs on a long-lived connection must stay interruptible from the keyboard, also
  // when another library's listener has taken the runtime's default action away.
  test.each(
    (
      [
        { mode: 'plain', bunArgs: [], signal: 'SIGINT', code: 130 },
        { mode: 'plain', bunArgs: [], signal: 'SIGTERM', code: 143 },
        { mode: '--hot', bunArgs: ['--hot'], signal: 'SIGINT', code: 130 },
        { mode: '--hot', bunArgs: ['--hot'], signal: 'SIGTERM', code: 143 },
        { mode: '--watch', bunArgs: ['--watch'], signal: 'SIGINT', code: 130 },
        { mode: '--watch', bunArgs: ['--watch'], signal: 'SIGTERM', code: 143 },
      ] as const
    ).flatMap((row) => [
      { ...row, listener: 'no other listener', env: {} as Record<string, string> },
      { ...row, listener: 'another listener', env: { FOREIGN_LISTENER: '1' } as Record<string, string> },
    ]),
  )(
    '$mode, $listener: a second $signal exits $code before the stop hook finishes',
    async ({ bunArgs, signal, code, env }) => {
      const worker = spawnWorker('slow-stop-worker', [...bunArgs], env);
      const stdout = tail(worker.stdout);

      try {
        await stdout.waitFor('SERVER_STARTED');

        worker.kill(signal);
        await stdout.waitFor('WORKER_STOPPING');
        worker.kill(signal);

        // Under the hook's 2 s, so a swallowed signal shows up as 'still alive'.
        expect(await exitCodeWithin(worker, 1_500)).toBe(code);
        await stdout.drained;
        expect(stdout.text()).not.toContain('WORKER_STOPPED');
      } finally {
        worker.kill('SIGKILL');
        await worker.exited;
      }
    },
    20_000,
  );
});
