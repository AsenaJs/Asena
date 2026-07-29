/**
 * A headless worker whose stop hook never settles *and* holds the event loop open, run as a
 * real process by GracefulShutdown.test.ts.
 *
 * This is the case `shutdown.forceExitAfter` exists for. The per-hook timeout gets the shutdown
 * moving again, but it cannot make a resource let go of the loop - so without a force deadline
 * the process sits there after a SIGTERM, and the orchestrator eventually SIGKILLs it, which is
 * the ungraceful ending the whole lifecycle is meant to avoid.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStart, OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class Stuck {
  private anchor?: Timer;

  @OnStart()
  public start(): void {
    console.log('STUCK_STARTED');
  }

  @OnStop()
  public stop(): Promise<void> {
    console.log('STUCK_STOPPING');

    // A ref'd timer nobody clears: the stand-in for a connection pool that will not drain.
    this.anchor = setInterval(() => undefined, 1000);

    return new Promise<void>(() => {});
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [Stuck],
  shutdown: {
    // Well under the 5000ms per-hook default, so the force deadline is what ends this process
    // and the test does not have to wait out the hook timeout to prove it.
    timeout: 200,
    forceExitAfter: 1000,
  },
});

await server.start();

console.log('SERVER_STARTED');
