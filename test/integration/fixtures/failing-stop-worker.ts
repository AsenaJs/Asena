/**
 * A headless worker whose stop hook throws, run as a real process by GracefulShutdown.test.ts.
 *
 * The question it answers: does a component that fails to let go take the process down with it,
 * or does the shutdown carry on, release everything else and report the failure in the exit code?
 * A deploy that rolls a pod must not depend on every component's teardown being flawless.
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
  public stop(): void | Promise<void> {
    if (process.env.STOP_FAILURE === 'rejects') {
      return Bun.sleep(20).then(() => {
        throw new Error('teardown rejected');
      });
    }

    if (process.env.STOP_FAILURE === 'times-out') {
      return new Promise<void>(() => {});
    }

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
  shutdown: process.env.SHUTDOWN_TIMEOUT ? { timeout: Number(process.env.SHUTDOWN_TIMEOUT) } : undefined,
});

await server.start();

if (process.env.APP_EXIT_CODE) {
  process.exitCode = Number(process.env.APP_EXIT_CODE);
}

console.log('SERVER_STARTED');

if (process.env.EXPLICIT_STOP) {
  await server.stop();

  console.log('EXPLICIT_STOP_RESOLVED');
}
