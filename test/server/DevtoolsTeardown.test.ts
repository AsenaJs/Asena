import { afterEach, describe, expect, mock, test } from 'bun:test';
import { devtoolsBus } from '../../lib/devtools/DevtoolsBus';
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
});
