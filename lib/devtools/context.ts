import type { Container } from '../ioc';
import type { ServerLogger } from '../logger';
import type { Ulak } from '../server/messaging';
import type { LifecycleState } from '../server/lifecycle/LifecycleState';
import type { GlobalMiddlewareConfig } from '../server/config';
import type { DevtoolsBus } from './DevtoolsBus';

/** The `globalThis` key the `asena console` wrapper sets to the agent factory. */
export const DEVTOOLS_HOOK = Symbol.for('asena.devtools');

/** @internal Why the console must stay off in this process, or `undefined` when it may attach. */
export const devtoolsRefusal = (): string | undefined =>
  process.env.NODE_ENV === 'production' ? 'NODE_ENV is production; the console is a development tool' : undefined;

/** What `AsenaServer.start()` hands the devtools agent once the server is ready. */
export interface DevtoolsServerContext {
  /** Bound HTTP port, `null` in headless mode. */
  port: number | null;
  /** Adapter name, `null` in headless mode. */
  adapter: string | null;
  container: Container;
  ulak: Ulak;
  lifecycle: { readonly state: LifecycleState };
  cron: { runNow(name: string): Promise<void> };
  events: { emit(event: string, data?: unknown): boolean };
  /** The `@Config.globalMiddlewares()` list as applied at boot; empty in headless mode. */
  globalMiddlewares: readonly GlobalMiddlewareConfig[];
  /** The server's own bus, not the one the agent's module copy would import. */
  bus: DevtoolsBus;
  /** The server's logger: where the agent reports its own failures, rather than the console it captures. */
  logger: ServerLogger;
}

export interface DevtoolsAttachment {
  /** Called when the server stops; must release whatever keeps the process alive. */
  detach(): void;
}

export type DevtoolsHook = (context: DevtoolsServerContext) => DevtoolsAttachment | void;
