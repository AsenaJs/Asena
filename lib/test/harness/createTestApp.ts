import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AsenaAdapter } from '../../adapter';
import { AsenaServerFactory } from '../../server/AsenaServerFactory';
import { TestHttpCall } from '../http/TestHttpCall';
import { silentLogger } from './silentLogger';
import type { TestApp, TestAppOptions } from './types';

// Monotonic, not random: workflow scripts and test runners may run many apps per process
// and a collision would surface as a confusing EADDRINUSE on a socket file
let socketCounter = 0;

function nextSocketPath(): string {
  socketCounter += 1;

  return join(tmpdir(), `asena-test-${process.pid}-${socketCounter}.sock`);
}

/**
 * Boots a full Asena application for testing - the equivalent of Spring's `@SpringBootTest`.
 *
 * Everything runs for real: the IoC container, all bootstrap phases, the adapter and its
 * routing pipeline. Only the components you name are registered, and any of them can be
 * swapped for a double through `overrides`.
 *
 * @param options - Adapter, components and optional overrides
 * @returns A started app with a fluent HTTP client attached
 *
 * @example
 * ```typescript
 * const [adapter] = createHonoAdapter({ logger: silentLogger });
 * const app = await createTestApp({
 *   adapter,
 *   components: [UserController, UserService],
 *   overrides: { UserService: { findById: mock(async () => ({ id: '1', name: 'Ada' })) } },
 * });
 *
 * await app.get('/users/1').expectStatus(200).expectJson({ id: '1', name: 'Ada' });
 *
 * await app.stop();
 * ```
 *
 * @example
 * ```typescript
 * // Automatic cleanup, and no TCP port taken at all
 * await using app = await createTestApp({ adapter, components, dispatch: 'socket' });
 * ```
 */
export async function createTestApp<A extends AsenaAdapter<any, any> = AsenaAdapter<any, any>>(
  options: TestAppOptions<A>,
): Promise<TestApp> {
  const { adapter, components, overrides, logger = silentLogger, dispatch = 'server' } = options;

  const socketPath = dispatch === 'socket' ? nextSocketPath() : undefined;

  const server = await AsenaServerFactory.create({
    adapter,
    logger,
    components,
    overrides,
    // Port 0 lets Bun assign a free ephemeral port, which removes the random-port race
    port: options.port ?? 0,
    // A test process boots many servers and owns its own signal handling; installing a handler
    // per app would leave a listener behind for every one of them. Also keeps a stray Ctrl+C
    // from being intercepted by whichever test app happened to be running.
    shutdown: { signals: false },
    // Nothing here should hold the event loop open once the suite is done.
    keepAlive: false,
  });

  await server.start(socketPath ? { unix: socketPath } : undefined);

  const port = server.httpServer?.port ?? 0;
  const baseUrl = socketPath ? 'http://localhost' : `http://localhost:${port}`;

  const call = (path: string, init?: RequestInit, method?: string): TestHttpCall => {
    const requestInit: RequestInit = { ...init };

    if (method) {
      requestInit.method = method;
    }

    if (socketPath) {
      // Bun routes the request over the socket while still parsing the URL for path/query
      (requestInit as any).unix = socketPath;
    }

    return new TestHttpCall(`${baseUrl}${path}`, requestInit);
  };

  let stopped = false;

  const app: TestApp = {
    server,
    container: server.coreContainer.container,
    port,
    baseUrl,
    socketPath,

    resolve: async <T>(name: string): Promise<T> => (await server.coreContainer.container.resolve<T>(name)) as T,

    wsUrl: (path: string): string => (socketPath ? `ws+unix://${socketPath}:${path}` : `ws://localhost:${port}${path}`),

    request: (path: string, init?: RequestInit) => call(path, init),
    get: (path: string, init?: RequestInit) => call(path, init, 'GET'),
    post: (path: string, init?: RequestInit) => call(path, init, 'POST'),
    put: (path: string, init?: RequestInit) => call(path, init, 'PUT'),
    patch: (path: string, init?: RequestInit) => call(path, init, 'PATCH'),
    delete: (path: string, init?: RequestInit) => call(path, init, 'DELETE'),
    head: (path: string, init?: RequestInit) => call(path, init, 'HEAD'),
    options: (path: string, init?: RequestInit) => call(path, init, 'OPTIONS'),

    stop: async (): Promise<void> => {
      if (stopped) {
        return;
      }

      stopped = true;

      await server.stop();

      if (socketPath) {
        // Bun removes the socket file on a clean stop; this only matters after a crash
        await unlink(socketPath).catch(() => {
          // Already gone - nothing to clean up
        });
      }
    },

    [Symbol.asyncDispose]: async (): Promise<void> => {
      await app.stop();
    },
  };

  return app;
}
