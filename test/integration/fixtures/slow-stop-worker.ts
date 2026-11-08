/**
 * A headless worker whose stop hook takes two seconds, run as a real process by
 * GracefulShutdown.test.ts: the window in which a second signal arrives. `WORKER_STOPPED` is
 * printed only if the hook got to finish.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class SlowToLetGo {
  @OnStop()
  public async stop(): Promise<void> {
    console.log('WORKER_STOPPING');

    await Bun.sleep(2_000);

    console.log('WORKER_STOPPED');
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [SlowToLetGo],
  shutdown: { timeout: 60_000 },
});

await server.start();

console.log('SERVER_STARTED');
