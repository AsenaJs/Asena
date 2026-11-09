import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { devtoolsBus } from '../../lib/devtools/DevtoolsBus';
import { ICoreServiceNames } from '../../lib/ioc';
import { OnStart, OnStop } from '../../lib/ioc/component';
import { AsenaServerFactory } from '../../lib/server';
import { Schedule, Service } from '../../lib/server/decorators';
import type { AsenaSchedule } from '../../lib/server/schedule';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { bootWithMockAdapter, installDevtoolsHook, mockAdapterOf } from '../devtools/helpers';

const order: string[] = [];

@Service()
class Recorder {
  @OnStop()
  public stop(): void {
    order.push('@OnStop');
  }
}

@Schedule({ cron: '0 4 * * *' })
class Nightly implements AsenaSchedule {
  public async execute() {}
}

@Service()
class BrokenAtStart {
  @OnStart()
  public start(): void {
    throw new Error('database unreachable');
  }
}

describe('devtools in AsenaServer teardown', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
    order.length = 0;

    if (devtoolsBus.enabled) {
      devtoolsBus.disable();
    }
  });

  // A command delivered mid-teardown would run against a closed pool and a disposed ulak.
  test('detaches the agent before anything else is torn down', async () => {
    let cronAtDetach: Promise<void> | undefined;

    restore = installDevtoolsHook((context) => ({
      detach: () => {
        order.push('detach');
        cronAtDetach = context.cron.runNow('Nightly');
      },
    }));

    const app = await bootWithMockAdapter([Recorder, Nightly]);
    const adapter = mockAdapterOf(app);

    adapter.stop.mockImplementation(async () => {
      order.push('adapter');
    });

    await app.stop();

    expect(order).toEqual(['detach', 'adapter', '@OnStop']);
    await expect(cronAtDetach).resolves.toBeUndefined();
  });

  test('a detach that throws still disables the bus', async () => {
    restore = installDevtoolsHook(() => ({
      detach: () => {
        throw new Error('ipc already closed');
      },
    }));

    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [Recorder],
      shutdown: { signals: false },
    });

    await server.start();
    expect(devtoolsBus.enabled).toBe(true);

    await expect(server.stop()).rejects.toThrow('1 failure');
    expect(devtoolsBus.enabled).toBe(false);
    expect(order).toEqual(['@OnStop']);
  });

  test('a hook that throws leaves the bus disabled', async () => {
    restore = installDevtoolsHook(() => {
      throw new Error('agent broke');
    });

    const warn = mock(() => {});
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: { ...silentLogger, warn },
      components: [Recorder],
      shutdown: { signals: false },
    });

    await server.start();

    expect(warn.mock.calls.flat().join('\n')).toContain('devtools agent failed to attach');
    expect(devtoolsBus.enabled).toBe(false);

    await server.stop();
    expect(devtoolsBus.enabled).toBe(false);
  });

  test('a boot that fails leaves the bus disabled', async () => {
    const hook = mock(() => ({ detach: () => {} }));

    restore = installDevtoolsHook(hook);

    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [BrokenAtStart],
      shutdown: { signals: false },
    });

    await expect(server.start()).rejects.toThrow('BrokenAtStart.start()');

    expect(hook).not.toHaveBeenCalled();
    expect(devtoolsBus.enabled).toBe(false);

    await server.stop();
    expect(devtoolsBus.enabled).toBe(false);
  });

  // The agent refuses production; an enabled bus would still have every adapter open and close a
  // record per request with nobody listening.
  test('under NODE_ENV=production the bus is never enabled and the hook never called', async () => {
    const hook = mock(() => ({ detach: () => {} }));
    const warn = mock(() => {});
    const previousEnv = process.env.NODE_ENV;
    let enabledDuringBoot: boolean | undefined;

    @Service()
    class BootProbe {
      @OnStart()
      public start(): void {
        enabledDuringBoot = devtoolsBus.enabled;
      }
    }

    restore = installDevtoolsHook(hook);
    process.env.NODE_ENV = 'production';

    try {
      const server = await AsenaServerFactory.create({
        headless: true,
        logger: { ...silentLogger, warn },
        components: [BootProbe],
        shutdown: { signals: false },
      });

      await server.start();

      expect(enabledDuringBoot).toBe(false);
      expect(hook).not.toHaveBeenCalled();
      expect(warn.mock.calls.flat().join('\n')).toContain('NODE_ENV is production');

      await server.stop();
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  test('a stop() issued while the agent is being attached leaves no attachment behind', async () => {
    let attached = 0;
    let detached = 0;

    restore = installDevtoolsHook(() => {
      attached += 1;

      return {
        detach: () => {
          detached += 1;
        },
      };
    });

    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [Recorder],
      shutdown: { signals: false },
    });
    const coreContainer = server.coreContainer;
    const resolve = coreContainer.resolve.bind(coreContainer);
    let releaseEmitter!: () => void;
    const emitterHeld = new Promise<void>((done) => {
      releaseEmitter = done;
    });
    let emitterRequested!: () => void;
    const emitterAsked = new Promise<void>((done) => {
      emitterRequested = done;
    });

    // attachDevtools() is the only caller resolving the emitter through the core container.
    spyOn(coreContainer, 'resolve').mockImplementation((async (name: string) => {
      if (name === ICoreServiceNames.EVENT_EMITTER) {
        emitterRequested();
        await emitterHeld;
      }

      return resolve(name);
    }) as any);

    const starting = server.start();

    await emitterAsked;
    await server.stop();
    releaseEmitter();
    await starting;

    expect(attached - detached).toBe(0);
    expect(devtoolsBus.enabled).toBe(false);
  });
});
