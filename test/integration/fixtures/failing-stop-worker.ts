/**
 * A headless worker whose stop hook throws, run as a real process by GracefulShutdown.test.ts.
 *
 * The question it answers: does a component that fails to let go take the process down with it,
 * or does the shutdown carry on and exit cleanly? A deploy that rolls a pod must not depend on
 * every component's teardown being flawless.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStart, OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class BrokenTeardown {
  @OnStart()
  public start(): void {
    console.log('BROKEN_STARTED');
  }

  @OnStop()
  public stop(): void {
    throw new Error('teardown blew up');
  }
}

@Service()
class RegisteredEarlier {
  @OnStart()
  public start(): void {
    console.log('EARLIER_STARTED');
  }

  // Registered before BrokenTeardown, so it stops *after* it. If a throwing hook aborted the
  // sequence this line would never be printed.
  @OnStop()
  public stop(): void {
    console.log('EARLIER_STOPPED');
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [RegisteredEarlier, BrokenTeardown],
});

await server.start();

console.log('SERVER_STARTED');
