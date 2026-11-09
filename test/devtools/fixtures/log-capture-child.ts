// Spawned by capture-process.test.ts with an IPC channel, the way `asena console` spawns the app.
import { attachDevtoolsAgent, DEVTOOLS_HOOK } from '../../../lib/devtools';
import { AsenaServerFactory } from '../../../lib/server';
import { Schedule } from '../../../lib/server/decorators';
import type { AsenaSchedule } from '../../../lib/server/schedule';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Schedule({ cron: '0 6 * * *' })
class ChattyJob implements AsenaSchedule {
  public async execute() {
    console.log('log line', 1);
    console.info('info line');
    console.debug('debug line');
    console.trace('trace line');
    console.warn('warn line');
    console.error(new Error('boom'));
    console.dir({ dir: 'line' });
    console.table([{ table: 'line' }]);
    console.assert(false, 'assert line');

    let inspected = 0;

    console.log('inspect line', {
      [Bun.inspect.custom]: () => `custom #${++inspected}`,
    });
    process.send!({ fixture: 'inspected', count: inspected });
    process.stdout.write('raw stdout\n');
    process.stderr.write(new TextEncoder().encode('raw stderr\n'));
    await Bun.sleep(1);
    console.log('after await');
  }
}

(globalThis as Record<symbol, unknown>)[DEVTOOLS_HOOK] = attachDevtoolsAgent;

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [ChattyJob],
});

await server.start();

console.log('outside console');
process.stdout.write('outside write\n');
process.send!({ fixture: 'outside-written' });
