// Run as a real process by CatchLoopProcess.test.ts: a catch-all @Catch that reports every failure
// by emitting into a listener that fails too. argv[2] picks how the emit leaves the @Catch.
// With CATCH_LOOP_DEVTOOLS set (and an IPC channel) the devtools bus is on, which is the other
// dispatch path of EventDispatchService.
import { attachDevtoolsAgent, DEVTOOLS_HOOK } from '../../../../lib/devtools';
import { devtoolsBus } from '../../../../lib/devtools/DevtoolsBus';
import { ICoreServiceNames } from '../../../../lib/ioc';
import { AsenaServerFactory } from '../../../../lib/server';
import { EventService, ExceptionHandler } from '../../../../lib/server/decorators';
import { On, type EventEmitter } from '../../../../lib/server/event';
import { Catch } from '../../../../lib/server/exception';
import { silentLogger } from '../../../../lib/test/harness/silentLogger';

const variant = process.argv[2];
// Without the guard the catch-all runs forever; the cap turns that into a wrong count instead of a hang.
const CAP = 50;
const caught: string[] = [];
const guardWarnings: string[] = [];
let reports = 0;
let emitter!: EventEmitter;

if (process.env.CATCH_LOOP_DEVTOOLS) {
  (globalThis as Record<symbol, unknown>)[DEVTOOLS_HOOK] = attachDevtoolsAgent;
}

const report = () => {
  emitter.emit('app.error');
};

@ExceptionHandler()
class Errors {
  @Catch()
  public fallback(error: Error): void | Promise<void> {
    caught.push(error.message);

    if (caught.length > CAP) {
      return;
    }

    if (variant === 'after-await') {
      return Bun.sleep(1).then(report);
    }

    if (variant === 'timer') {
      setTimeout(report, 0);

      return;
    }

    report();
  }
}

@EventService()
class Events {
  @On('job.run')
  public run() {
    throw new Error('job failed');
  }

  @On('audit.run')
  public async audit() {
    throw new Error('audit failed');
  }

  @On('app.error')
  public onError(): void | Promise<void> {
    if (variant === 'two-hops') {
      emitter.emit('reporter.send');

      return;
    }

    reports += 1;

    if (variant === 'sync-throw') {
      throw new Error('reporter down');
    }

    return Promise.reject(new Error('reporter down'));
  }

  @On('reporter.send')
  public async send() {
    reports += 1;

    throw new Error('reporter down');
  }
}

const server = await AsenaServerFactory.create({
  headless: true,
  logger: {
    ...silentLogger,
    warn: (message: string) => {
      if (message.includes('is not routed to @Catch')) {
        guardWarnings.push(message);
      }
    },
  },
  components: [Errors, Events],
});

await server.start();
emitter = await server.resolve<EventEmitter>(ICoreServiceNames.EVENT_EMITTER);

const settled = async (expectedReports: number) => {
  const deadline = Date.now() + 5_000;

  while (reports < expectedReports && Date.now() < deadline) {
    await Bun.sleep(1);
  }

  // Each turn of a loop costs at most one timer; twenty turns would show one.
  for (let turn = 0; turn < 20; turn += 1) {
    await Bun.sleep(1);
  }

  return { caught: [...caught], reports, guardWarnings: guardWarnings.length };
};

emitter.emit('job.run');

const afterFirst = await settled(1);

emitter.emit('audit.run');

const afterSecond = await settled(2);

const result = { afterFirst, afterSecond, guardWarning: guardWarnings[0], busEnabled: devtoolsBus.enabled };

console.log(`RESULT ${JSON.stringify(result)}`);
await server.stop();
