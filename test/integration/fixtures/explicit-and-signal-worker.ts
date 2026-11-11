/**
 * Two headless servers in one process, run as a real process by GracefulShutdown.test.ts. The first
 * stops itself with a slow @OnStop; the test sends the signal, which only the second still handles,
 * while that hook runs.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class FlushesOnStop {
  @OnStop()
  public async stop(): Promise<void> {
    console.log('EXPLICIT_STOPPING');
    await Bun.sleep(800);
    console.log('EXPLICIT_STOPPED');
  }
}

@Service()
class QuickToStop {
  @OnStop()
  public stop(): void {
    console.log('SIGNAL_STOPPED');
  }
}

const explicit = await AsenaServerFactory.create({ headless: true, logger: silentLogger, components: [FlushesOnStop] });
const signalled = await AsenaServerFactory.create({ headless: true, logger: silentLogger, components: [QuickToStop] });

await explicit.start();
await signalled.start();

void explicit.stop();
