import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DevtoolsServerContext } from '../../lib/devtools/context';
import { Schedule, Service } from '../../lib/server/decorators';
import type { AsenaSchedule } from '../../lib/server/schedule';
import { AsenaServerFactory, LifecycleState } from '../../lib/server';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { bootWithMockAdapter, installDevtoolsHook } from './helpers';

@Service()
class PlainService {}

@Schedule({ cron: '0 4 * * *' })
class MorningReport implements AsenaSchedule {
  public static runs = 0;

  public async execute() {
    MorningReport.runs += 1;
  }
}

describe('devtools hook in AsenaServer.start()', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  test('hands the ready server to the hook once, then detaches it on stop', async () => {
    const detach = mock(() => {});
    const seen: { context: DevtoolsServerContext; state: string }[] = [];

    restore = installDevtoolsHook((context) => {
      seen.push({ context, state: context.lifecycle.state });

      return { detach };
    });

    const app = await bootWithMockAdapter([PlainService, MorningReport], 23456);

    expect(seen).toHaveLength(1);

    const [{ context, state }] = seen;

    // Called once start hooks have run and the adapter is listening: it is the ready signal.
    expect(state).toBe('STARTED');
    expect(context.port).toBe(23456);
    expect(context.adapter).toBe('MockAdapter');
    expect(context.container).toBe(app.server.coreContainer.container);
    expect(context.ulak).toBe(await app.server.coreContainer.resolve('__Ulak__'));
    expect(Object.keys(context).sort()).toEqual([
      'adapter',
      'bus',
      'container',
      'cron',
      'events',
      'globalMiddlewares',
      'lifecycle',
      'port',
      'ulak',
    ]);

    await context.cron.runNow('MorningReport');
    expect(MorningReport.runs).toBe(1);
    expect(context.events.emit('nobody.listens')).toBe(false);

    expect(detach).not.toHaveBeenCalled();
    await app.stop();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(context.lifecycle.state).toBe(LifecycleState.STOPPED);
  });

  test('passes null port and adapter in headless mode', async () => {
    const seen: DevtoolsServerContext[] = [];

    restore = installDevtoolsHook((context) => {
      seen.push(context);
    });

    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [PlainService],
      shutdown: { signals: false },
    });

    await server.start();
    await server.stop();

    expect(seen.map(({ port, adapter }) => ({ port, adapter }))).toEqual([{ port: null, adapter: null }]);
  });

  test('does nothing when the process has no IPC channel', async () => {
    const hook = mock(() => undefined);

    restore = installDevtoolsHook(hook, { ipc: false });

    await using app = await bootWithMockAdapter([PlainService]);

    expect(hook).not.toHaveBeenCalled();
    expect((app.server as any).devtools).toBeUndefined();
  });

  test('does nothing when no hook is set', async () => {
    restore = installDevtoolsHook(undefined as any);

    await using app = await bootWithMockAdapter([PlainService]);

    expect((app.server as any).devtools).toBeUndefined();
  });

  test('a hook that throws is reported and the server keeps running', async () => {
    restore = installDevtoolsHook(() => {
      throw new Error('agent broke');
    });

    const warn = mock(() => {});
    const logger = { ...silentLogger, warn };
    const server = await AsenaServerFactory.create({
      headless: true,
      logger,
      components: [PlainService],
      shutdown: { signals: false },
    });

    await server.start();

    expect(warn.mock.calls.flat().join('\n')).toContain('devtools agent failed to attach');
    expect(server.coreContainer).toBeDefined();

    await server.stop();
  });
});
