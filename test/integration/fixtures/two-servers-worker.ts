/**
 * Two headless servers in one process, run as a real process by GracefulShutdown.test.ts. It is the
 * state `bun --hot` leaves after a reload: the previous server's signal handlers are still installed.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class QuickToStop {
  @OnStop()
  public stop(): void {
    console.log('QUICK_STOPPED');
  }
}

@Service()
class SlowToStop {
  @OnStop()
  public async stop(): Promise<void> {
    await Bun.sleep(300);
    console.log('SLOW_STOPPED');
  }
}

for (const component of [QuickToStop, SlowToStop]) {
  const server = await AsenaServerFactory.create({ headless: true, logger: silentLogger, components: [component] });

  await server.start();
}

console.log('SERVER_STARTED');
