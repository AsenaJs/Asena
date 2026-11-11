import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const APP = join(import.meta.dir, 'fixtures', 'catch-loop-app.ts');

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

interface Counts {
  caught: string[];
  reports: number;
  guardWarnings: number;
}

interface AppResult {
  afterFirst: Counts;
  afterSecond: Counts;
  guardWarning?: string;
  busEnabled: boolean;
}

const run = async (variant: string, devtools: boolean) => {
  const app = Bun.spawn({
    cmd: [process.execPath, APP, variant],
    // The repo root, so Bun applies its tsconfig (legacy decorators).
    cwd: ROOT,
    env: { ...process.env, ...(devtools && { CATCH_LOOP_DEVTOOLS: '1' }) },
    stdout: 'pipe',
    stderr: 'pipe',
    ...(devtools && { ipc: () => undefined }),
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([new Response(app.stdout).text(), new Response(app.stderr).text(), app.exited]),
      Bun.sleep(9_000).then(() => {
        throw new Error(`the ${variant} app did not finish`);
      }),
    ]);
    const result = /^RESULT (.+)$/m.exec(stdout);

    if (!result) {
      throw new Error(`no result from the ${variant} app (exit ${exitCode}):\n${stdout}\n${stderr}`);
    }

    return { ...(JSON.parse(result[1]) as AppResult), stderr, exitCode };
  } finally {
    app.kill('SIGKILL');
  }
};

/**
 * The guard against a @Catch receiving failures it set off itself, in a booted application and a
 * real process: nothing is mocked, so a loop would show as a runaway count or a process that never
 * finishes.
 */
describe('a catch-all @Catch that reports into a failing @On listener', () => {
  const variants = {
    sync: ['emits synchronously', 'app.error'],
    'after-await': ['emits after an await', 'app.error'],
    timer: ['emits from a timer', 'app.error'],
    'sync-throw': ['emits into a listener that throws synchronously', 'app.error'],
    'two-hops': ['emits into a listener that emits into the failing one', 'reporter.send'],
  } as const;

  for (const devtools of [false, true]) {
    describe(devtools ? 'with the devtools bus on' : 'in a plain process', () => {
      for (const [variant, [title, failingEvent]] of Object.entries(variants)) {
        test(`${title}: one catch per original failure, then @Catch works again`, async () => {
          const { afterFirst, afterSecond, guardWarning, busEnabled, stderr, exitCode } = await run(variant, devtools);

          expect(busEnabled).toBe(devtools);
          expect(afterFirst).toEqual({ caught: ['job failed'], reports: 1, guardWarnings: 1 });
          expect(afterSecond).toEqual({ caught: ['job failed', 'audit failed'], reports: 2, guardWarnings: 2 });
          expect(guardWarning).toContain('Errors.fallback()');

          // The failures the @Catch set off still get the framework's default line, once each.
          expect(occurrences(stderr, `error in handler for event "${failingEvent}"`)).toBe(2);
          expect(occurrences(stderr, 'error in handler for event "job.run"')).toBe(1);
          expect(occurrences(stderr, 'error in handler for event "audit.run"')).toBe(1);
          expect(exitCode).toBe(0);
        }, 15_000);
      }
    });
  }
});
