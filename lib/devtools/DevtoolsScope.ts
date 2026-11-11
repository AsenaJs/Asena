import { CoreService, ICoreServiceNames } from '../ioc';
import type { ICoreService } from '../ioc';
import { devtoolsBus, type DevtoolsOpenRecord } from './DevtoolsBus';
import type { DevtoolsRequestStep, DevtoolsStepKind } from './protocol';

// On globalThis rather than in module scope: a `--hot` reload evaluates a fresh copy of this module
// while servers the previous copy numbered may still be attached to the console.
const SERVER_IDS = Symbol.for('asena.devtools.serverIds');

const nextServerId = (): string => {
  const slot = globalThis as Record<symbol, unknown>;
  const next = ((slot[SERVER_IDS] as number | undefined) ?? 0) + 1;

  slot[SERVER_IDS] = next;

  return `server-${next}`;
};

/**
 * The process-wide devtools bus as one server's emit sites see it: every record opened through it
 * carries that server's id, which is how the console tells the servers of one process apart.
 *
 * @internal
 */
@CoreService(ICoreServiceNames.DEVTOOLS_SCOPE)
export class DevtoolsScope implements ICoreService {
  public readonly serviceName = 'DevtoolsScope';

  /** Unique among the servers of this process and fixed for the server's life; opaque to the host. */
  public readonly serverId = nextServerId();

  public get enabled(): boolean {
    return devtoolsBus.enabled;
  }

  public open(method: string, path: string): DevtoolsOpenRecord {
    return devtoolsBus.open(method, path, this.serverId);
  }

  public run<T>(record: DevtoolsOpenRecord, fn: () => T): T {
    return devtoolsBus.run(record, fn);
  }

  public step(kind: DevtoolsStepKind, name: string): void {
    devtoolsBus.step(kind, name);
  }

  public close(record: DevtoolsOpenRecord, status: number, answeredBy?: DevtoolsRequestStep): void {
    devtoolsBus.close(record, status, answeredBy);
  }

  public observe<T>(method: string, path: string, handler: string, fn: () => T): T {
    return devtoolsBus.observe(method, path, handler, fn, this.serverId);
  }
}
