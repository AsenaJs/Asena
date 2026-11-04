import { mock } from 'bun:test';
import { DEVTOOLS_HOOK, type DevtoolsHook } from '../../lib/devtools/context';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import type { TestApp } from '../../lib/test/harness/types';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * Sets the console wrapper's hook, and `process.send` as an IPC child has it unless `ipc` is false.
 *
 * @returns Restores both
 */
export const installDevtoolsHook = (hook: DevtoolsHook, { ipc = true }: { ipc?: boolean } = {}): (() => void) => {
  const hooks = globalThis as Record<symbol, unknown>;
  const previousSend = process.send;

  hooks[DEVTOOLS_HOOK] = hook;

  if (ipc) {
    (process as any).send = () => true;
  }

  return () => {
    delete hooks[DEVTOOLS_HOOK];
    (process as any).send = previousSend;
  };
};

/** The mock adapter lacks these; a real adapter always has onError and registerHTMLRoute, and may have onNotFound. */
export const bootWithMockAdapter = async (components: any[], port?: number): Promise<TestApp> => {
  const { adapter } = createMockAdapter();

  (adapter as any).onError = mock(() => {});
  (adapter as any).onNotFound = mock(() => {});
  (adapter as any).registerHTMLRoute = mock(() => {});

  if (port !== undefined) {
    (adapter as any).start = mock(async () => ({ port }));
  }

  return createTestApp({ adapter: adapter as any, logger: silentLogger, components });
};

export const mockAdapterOf = (app: TestApp): any =>
  (app.server.coreContainer.container.services.AsenaAdapter as any).instance;
