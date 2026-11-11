// Spawned by capture-process.test.ts with an IPC channel. As in `asena console`, the devtools module is
// imported before the app's own code runs, and the app wraps console.log before it starts the server.
import { attachDevtoolsAgent, DEVTOOLS_HOOK } from '../../../lib/devtools';
import { AsenaServerFactory } from '../../../lib/server';
import { Schedule } from '../../../lib/server/decorators';
import type { AsenaSchedule } from '../../../lib/server/schedule';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

const redact = (arg: unknown): unknown =>
  typeof arg === 'string' ? arg.replaceAll(/token=\S+/g, 'token=[redacted]') : arg;
const appLog = console.log;

console.log = (...args: unknown[]) => appLog(...args.map(redact));

@Schedule({ cron: '0 6 * * *' })
class TokenJob implements AsenaSchedule {
  public async execute() {
    console.log('issued token=SECRET for', 'shelf');
  }
}

(globalThis as Record<symbol, unknown>)[DEVTOOLS_HOOK] = attachDevtoolsAgent;

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [TokenJob],
});

await server.start();

process.send!({ fixture: 'ready' });
