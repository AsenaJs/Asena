import type { AsenaAdapter } from '../../adapter';
import type { Container } from '../../ioc';
import type { ServerLogger } from '../../logger';
import type { AsenaServer } from '../../server/AsenaServer';
import type { Class } from '../../server/types';
import type { TestHttpCall } from '../http/TestHttpCall';

/**
 * How the test app accepts requests.
 *
 * - `server` - listens on a TCP port (default). Matches production exactly.
 * - `socket` - listens on a unix domain socket instead. Still the adapter's real routing
 *   pipeline, but occupies no port, so parallel suites cannot collide. Requires an adapter
 *   that honours `AsenaStartOptions.unix`.
 */
export type DispatchMode = 'server' | 'socket';

/**
 * Options for {@link createTestApp}
 */
export interface TestAppOptions<A extends AsenaAdapter<any, any> = AsenaAdapter<any, any>> {
  /**
   * The adapter instance to boot, e.g. `createHonoAdapter({ logger: silentLogger })[0]`
   */
  adapter: A;

  /**
   * Components to register. Passing this list skips filesystem scanning entirely.
   */
  components: Class[];

  /**
   * Replace registered components with test doubles, keyed by service name (`@MockBean`).
   *
   * Override services, not controllers: a plain object mock carries no `@Controller`
   * metadata, so an overridden controller's routes would never be registered.
   */
  overrides?: Record<string, object>;

  /**
   * Logger for the booted server
   *
   * @default silentLogger
   */
  logger?: ServerLogger;

  /**
   * Port to bind. Ignored in `socket` dispatch.
   *
   * @default 0 - Bun picks a free ephemeral port, which removes the port race entirely
   */
  port?: number;

  /**
   * @default 'server'
   */
  dispatch?: DispatchMode;
}

/**
 * A booted test application
 */
export interface TestApp {
  /**
   * The running server
   */
  readonly server: AsenaServer<any>;

  /**
   * The user component container
   */
  readonly container: Container;

  /**
   * The bound TCP port. `0` in `socket` dispatch, where no port is used.
   */
  readonly port: number;

  /**
   * Base URL for HTTP calls. In `socket` dispatch the host is a placeholder - routing
   * happens over {@link socketPath}.
   */
  readonly baseUrl: string;

  /**
   * Path of the unix socket, when running in `socket` dispatch
   */
  readonly socketPath?: string;

  /**
   * Resolves a component from the container
   *
   * @param name - Registered service name
   */
  resolve<T>(name: string): Promise<T>;

  /**
   * Builds a WebSocket URL for the given path, correct for the active dispatch mode
   *
   * @param path - Route path, e.g. `/ws/chat`
   */
  wsUrl(path: string): string;

  /**
   * Starts a request with an explicit method in `init`
   *
   * @param path - Path relative to the app root
   * @param init - Standard fetch init
   */
  request(path: string, init?: RequestInit): TestHttpCall;

  get(path: string, init?: RequestInit): TestHttpCall;
  post(path: string, init?: RequestInit): TestHttpCall;
  put(path: string, init?: RequestInit): TestHttpCall;
  patch(path: string, init?: RequestInit): TestHttpCall;
  delete(path: string, init?: RequestInit): TestHttpCall;
  head(path: string, init?: RequestInit): TestHttpCall;
  options(path: string, init?: RequestInit): TestHttpCall;

  /**
   * Stops the server and removes the unix socket if one was created. Idempotent.
   */
  stop(): Promise<void>;

  /**
   * Enables `await using app = await createTestApp(...)`
   */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Options for {@link createWebTest}
 */
export interface WebTestOptions<A extends AsenaAdapter<any, any> = AsenaAdapter<any, any>> {
  adapter: A;

  /**
   * Controller(s) under test
   */
  controllers: Class | Class[];

  /**
   * Extra components to register for real, alongside the controllers' middlewares and
   * validators (which are always real, since the framework resolves them by name)
   */
  components?: Class[];

  /**
   * Explicit doubles, keyed by service name. These win over the generated auto-mocks.
   */
  overrides?: Record<string, object>;

  logger?: ServerLogger;
  port?: number;
  dispatch?: DispatchMode;
}

/**
 * Result of {@link createWebTest}
 */
export interface WebTestResult {
  app: TestApp;

  /**
   * Every double in play - both auto-generated mocks and the explicit `overrides` - keyed
   * by **service name** (not field name, unlike `mockComponent`).
   *
   * One shared mock per service, so two controllers injecting the same service see the
   * same double.
   */
  mocks: Record<string, any>;
}
