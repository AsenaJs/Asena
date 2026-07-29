/**
 * A headless worker, run as a real process by GracefulShutdown.test.ts.
 *
 * This is the shape the framework could not support before: a component that runs for the
 * process's lifetime, started and stopped by the container. Note what the entry file does NOT
 * do - it does not resolve the component out of the container, it does not translate signals,
 * and it does not block on the run loop. Two lines, same as an HTTP application's.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStart, OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

@Service()
class RunWorker {
  private running = false;

  private ticks = 0;

  /** Resolves the current sleep early, so stop() does not have to wait out a poll interval. */
  private wake?: () => void;

  /** The loop itself, so stop() can wait for the tick in flight to finish. */
  private loop?: Promise<void>;

  @OnStart()
  public start(): void {
    this.running = true;
    this.loop = this.run();

    // The hook returns here. The loop keeps going on its own, and start() completes.
    console.log('WORKER_STARTED');
  }

  @OnStop()
  public async stop(): Promise<void> {
    this.running = false;
    this.wake?.();

    // Cooperative: let the tick in flight finish rather than being killed mid-step.
    await this.loop;

    console.log(`WORKER_STOPPED ticks=${this.ticks}`);
  }

  private async run(): Promise<void> {
    while (this.running) {
      this.ticks++;
      await this.sleep(25);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);

      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: [RunWorker],
});

await server.start();

console.log('SERVER_STARTED');
