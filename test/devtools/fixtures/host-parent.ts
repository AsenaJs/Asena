// Spawned by host-process.test.ts, which kills it: it stands in for an `asena console` host that dies
// while the app is still sending. The app's output goes to files, since this process will not be
// there to read a pipe.
import { join } from 'node:path';

const [dir] = process.argv.slice(2);
let ready = false;

const child = Bun.spawn({
  cmd: [process.execPath, join(import.meta.dir, 'host-child.ts')],
  cwd: join(import.meta.dir, '..', '..', '..'),
  env: { ...process.env, HOST_CHILD_TICK_MS: '20', HOST_CHILD_EXIT_FILE: join(dir, 'exit') },
  stdout: Bun.file(join(dir, 'stdout')),
  stderr: Bun.file(join(dir, 'stderr')),
  ipc(message) {
    if (!ready && typeof message === 'object' && message !== null && 'ready' in message) {
      ready = true;
      console.log(`CHILD_PID ${child.pid}`);
    }
  },
});
