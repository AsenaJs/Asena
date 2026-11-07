/**
 * A headless worker that calls stop() itself, run as a real process by GracefulShutdown.test.ts.
 * Only a signal may end the process: a programmatic stop() leaves it to the caller.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class Worker {
  @OnStop()
  public stop(): void {
    console.log('WORKER_STOPPED');
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [Worker],
});

await server.start();
await server.stop();

console.log('EXPLICIT_STOP_RETURNED');
