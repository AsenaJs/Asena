/**
 * A headless worker whose stop hook settles but leaves a ref'd timer behind, run as a real process
 * by GracefulShutdown.test.ts. Outside --hot / --watch that timer must keep the process visibly alive.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class LeakyPool {
  @OnStop()
  public stop(): void {
    setInterval(() => undefined, 1000);
    console.log('WORKER_STOPPED');
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [LeakyPool],
});

await server.start();

console.log('SERVER_STARTED');
