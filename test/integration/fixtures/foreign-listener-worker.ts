/**
 * A headless worker next to another SIGINT listener that flushes asynchronously - a telemetry
 * exporter's own hook - run as a real process by GracefulShutdown.test.ts. `HOLD=1` makes that
 * listener leave a ref'd handle behind instead, so it never settles.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

process.on('SIGINT', async () => {
  if (process.env.HOLD === '1') {
    setInterval(() => undefined, 1000);

    return;
  }

  await Bun.sleep(400);
  console.log('FOREIGN_FLUSHED');
});

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
  shutdown: { timeout: 1000 },
});

await server.start();

console.log('SERVER_STARTED');
