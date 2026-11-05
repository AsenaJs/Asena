import { afterEach, describe, expect, mock, test } from 'bun:test';
import { devtoolsBus } from '../../lib/devtools/DevtoolsBus';
import type { AsenaContext } from '../../lib/adapter';
import { Controller, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import type { TestApp } from '../../lib/test/harness/types';
import { createMockAdapter } from '../utils/createMockContext';
import { installDevtoolsHook } from './helpers';

@Controller('/notes')
class NoteController {
  @Get('/')
  public list(context: AsenaContext<any, any>) {
    return context.send([]);
  }
}

@Service()
class PlainService {}

/** The mock adapter, recording the order of the calls that matter to an adapter wrapping its request path. */
const bootRecording = async (withAttach = true): Promise<{ app: TestApp; calls: string[]; attach: any }> => {
  const { adapter } = createMockAdapter();
  const calls: string[] = [];
  const registerRoute = adapter.registerRoute;
  const attach = mock((_bus: unknown) => {
    calls.push('attachDevtools');
  });

  (adapter as any).onError = mock(() => {});
  (adapter as any).onNotFound = mock(() => {});
  (adapter as any).registerHTMLRoute = mock(() => {});
  (adapter as any).registerRoute = mock(async (route: any) => {
    calls.push('registerRoute');

    return registerRoute(route);
  });
  (adapter as any).start = mock(async () => {
    calls.push('start');

    return { port: 0 };
  });

  if (withAttach) {
    (adapter as any).attachDevtools = attach;
  }

  const app = await createTestApp({
    adapter: adapter as any,
    logger: silentLogger,
    components: [NoteController, PlainService],
  });

  return { app, calls, attach };
};

describe('adapter.attachDevtools in AsenaServer.start()', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  test('hands the server bus to the adapter once, before any route is registered and before start', async () => {
    restore = installDevtoolsHook(() => undefined);

    const { app, calls, attach } = await bootRecording();

    // The adapter decides at registration time whether to wrap, so it must already hold the bus.
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0][0]).toBe(devtoolsBus);
    expect(calls).toEqual(['attachDevtools', 'registerRoute', 'start']);
    // The bus is live when the adapter gets it, so `enabled` is a usable switch.
    expect((attach.mock.calls[0][0] as typeof devtoolsBus).enabled).toBe(true);

    await app.stop();
    expect(attach).toHaveBeenCalledTimes(1);
  });

  test('is never called without the hook', async () => {
    restore = installDevtoolsHook(undefined as any);

    const { app, calls, attach } = await bootRecording();

    expect(attach).not.toHaveBeenCalled();
    expect(calls).toEqual(['registerRoute', 'start']);

    await app.stop();
  });

  test('is never called when the process has no IPC channel, even with the hook set', async () => {
    const hook = mock(() => undefined);

    restore = installDevtoolsHook(hook, { ipc: false });

    const { app, attach } = await bootRecording();

    expect(attach).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();

    await app.stop();
  });

  test('an adapter without the method boots and still hands the server to the agent', async () => {
    const hook = mock(() => undefined);

    restore = installDevtoolsHook(hook);

    const { app, calls } = await bootRecording(false);

    expect(calls).toEqual(['registerRoute', 'start']);
    expect(hook).toHaveBeenCalledTimes(1);

    await app.stop();
  });
});
