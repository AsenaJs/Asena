import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const fixture = join(import.meta.dir, 'fixtures', 'broken-middleware-worker.ts');

/**
 * A middleware without handle() used to print to stderr and call process.exit() with no code,
 * so a broken app or test file exited 0 and CI reported green. The fixture runs in a real
 * process to check the exit status a CI job would actually see.
 */
describe('@Middleware definition in a real process', () => {
  test('a middleware without handle() makes the process exit non-zero', async () => {
    const worker = Bun.spawn(['bun', fixture], { stdout: 'pipe', stderr: 'pipe' });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(worker.stdout).text(),
      new Response(worker.stderr).text(),
      worker.exited,
    ]);

    expect(exitCode).not.toBe(0);
    expect(stdout).not.toContain('LOADED_WITHOUT_ERROR');
    expect(stderr).toContain("Class BrokenMiddleware must implement a 'handle(context, next)' method.");
  });
});
