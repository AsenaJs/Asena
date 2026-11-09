import { mock } from 'bun:test';
import { AsenaServerFactory } from '../../../lib/server';
import type { AsenaContext, NotFoundRequest } from '../../../lib/adapter';
import { createMockAdapter } from '../../utils/createMockContext';

export type CapturedErrorHandler = (error: Error, context: AsenaContext<any, any>) => Promise<Response | undefined>;
export type CapturedNotFoundHandler = (
  context: AsenaContext<any, any>,
  request: NotFoundRequest,
) => Promise<Response | undefined>;

export const createLogger = () => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  profile: mock(() => {}),
  debug: mock(() => {}),
});

export interface BootOptions {
  /** Drop `onNotFound` from the adapter, as a third-party adapter written before the hook would. */
  withoutAdapterNotFound?: boolean;
  logger?: ReturnType<typeof createLogger>;
}

/**
 * Boots a server against the mock adapter and hands back whatever the framework registered.
 *
 * `onError` / `onNotFound` are captured rather than invoked through a real HTTP request because
 * what is under test is the *chain the framework composed* - which link answers, and what it
 * returns when none of them do. The mock adapter has neither hook of its own; a real adapter
 * always has `onError` (abstract on AsenaAdapter) and may have `onNotFound` (optional).
 */
export const bootExceptionApp = async (components: any[], options: BootOptions = {}) => {
  const { adapter } = createMockAdapter();
  const logger = options.logger ?? createLogger();

  let errorHandler: CapturedErrorHandler | undefined;
  let notFoundHandler: CapturedNotFoundHandler | undefined;

  // The mock adapter carries neither of these. `serveOptions` is abstract on AsenaAdapter, so a
  // real one always has it, and a @Config declaring it would otherwise crash the boot here rather
  // than in anything under test.
  (adapter as any).serveOptions = mock(() => {});

  const onError = mock((handler: any) => {
    errorHandler = handler;
  });

  (adapter as any).onError = onError;

  const onNotFound = mock((handler: any) => {
    notFoundHandler = handler;
  });

  if (!options.withoutAdapterNotFound) {
    (adapter as any).onNotFound = onNotFound;
  }

  const server = await AsenaServerFactory.create({
    adapter: adapter as any,
    logger: logger as any,
    port: 3000,
    components,
  });

  await server.start();

  return {
    server,
    logger,
    onError,
    onNotFound,
    /** The composed error chain, or undefined when the framework registered nothing. */
    get errorHandler() {
      return errorHandler;
    },
    /** The composed not-found chain, or undefined when the framework registered nothing. */
    get notFoundHandler() {
      return notFoundHandler;
    },
  };
};

/** A context whose `send` builds a real Response, so a chain's return value can be asserted on. */
export const responseContext = () =>
  ({
    send: mock((data: any, status?: any) =>
      typeof data === 'string'
        ? new Response(data, { status: typeof status === 'number' ? status : 200 })
        : Response.json(data, { status: typeof status === 'number' ? status : 200 }),
    ),
  }) as unknown as AsenaContext<any, any>;
