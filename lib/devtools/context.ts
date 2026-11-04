import type { Container } from '../ioc';
import type { Ulak } from '../server/messaging';
import type { LifecycleState } from '../server/lifecycle/LifecycleState';
import type { GlobalMiddlewareConfig } from '../server/config';
import type { ExceptionRegistryView } from '../server/exception/ExceptionRegistry';

/** The `globalThis` key the `asena console` wrapper sets to the agent factory. */
export const DEVTOOLS_HOOK = Symbol.for('asena.devtools');

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
  exceptions: ExceptionRegistryView;
}

export interface DevtoolsAttachment {
  /** Called when the server stops; must release whatever keeps the process alive. */
  detach(): void;
}

export type DevtoolsHook = (context: DevtoolsServerContext) => DevtoolsAttachment | void;
