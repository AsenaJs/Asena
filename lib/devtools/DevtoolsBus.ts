import { AsyncLocalStorage } from 'node:async_hooks';
import type { DevtoolsRequestLog, DevtoolsRequestRecord, DevtoolsRequestStep, DevtoolsStepKind } from './protocol';

const MAX_LOG_ENTRIES = 100;
const MAX_LOG_CHARS = 16 * 1024;

/** A record between `open()` and `close()`. */
export interface DevtoolsOpenRecord {
  readonly id: string;
  readonly startedAt: number;
  readonly method: string;
  readonly path: string;
  readonly steps: DevtoolsRequestStep[];
  readonly startTime: number;
  readonly logs: DevtoolsRequestLog[];
  logChars: number;
  logsTruncated: boolean;
  closed: boolean;
}

export type DevtoolsRecordListener = (record: DevtoolsRequestRecord) => void;

/**
 * Collects the steps a request or a dispatch went through, for the console's request inspector.
 *
 * Enabled at boot only when the console hook is present. Disabled, every wrap point hands back the
 * function it was given and `step()` returns after one property read: nothing is wrapped and no
 * storage exists. Records are correlated with `AsyncLocalStorage`, entered by whoever frames the
 * record (an adapter for HTTP, core for `@On`, `@Schedule` and message handlers).
 *
 * @internal
 */
export class DevtoolsBus {
  private storage?: AsyncLocalStorage<DevtoolsOpenRecord>;

  private contractNames?: WeakMap<object, string>;

  private listener?: DevtoolsRecordListener;

  private sequence = 0;

  /** Whether the emit sites were wired. Decided once, at the start of `AsenaServer.start()`. */
  public get enabled(): boolean {
    return this.storage !== undefined;
  }

  public enable(): void {
    this.storage ??= new AsyncLocalStorage();
    this.contractNames ??= new WeakMap();
  }

  public disable(): void {
    this.storage = undefined;
    this.contractNames = undefined;
    this.listener = undefined;
  }

  /** One listener at a time: the agent. @returns Unsubscribe */
  public subscribe(listener: DevtoolsRecordListener): () => void {
    this.listener = listener;

    return () => {
      if (this.listener === listener) {
        this.listener = undefined;
      }
    };
  }

  /** Appends a step to the record of the current async context, if one is open. */
  public step(kind: DevtoolsStepKind, name: string): void {
    this.storage?.getStore()?.steps.push({ kind, name });
  }

  /** Hands `fn` back untouched when disabled; otherwise a pass-through that records the step first. */
  public wrap<A extends unknown[], R>(kind: DevtoolsStepKind, name: string, fn: (...args: A) => R): (...args: A) => R {
    if (!this.enabled) {
      return fn;
    }

    return (...args: A): R => {
      this.step(kind, name);

      return fn(...args);
    };
  }

  /** Names a `Context.define` schema map after its context class, for the `validator` step. */
  public nameContract(schemas: object, name: string): void {
    this.contractNames?.set(schemas, name);
  }

  public contractName(schemas: object): string {
    return this.contractNames?.get(schemas) ?? 'Context';
  }

  public open(method: string, path: string): DevtoolsOpenRecord {
    this.sequence += 1;

    return {
      id: `${process.pid}-${this.sequence}`,
      startedAt: Date.now(),
      method,
      path,
      steps: [],
      startTime: performance.now(),
      logs: [],
      logChars: 0,
      logsTruncated: false,
      closed: false,
    };
  }

  /**
   * Appends an output write to the record of the current async context, while it is open.
   *
   * @param render - Called only when a record takes the write
   */
  public captureOutput(stream: DevtoolsRequestLog['stream'], render: () => string): void {
    const record = this.storage?.getStore();

    if (!record || record.closed || record.logsTruncated) {
      return;
    }

    if (record.logs.length === MAX_LOG_ENTRIES || record.logChars === MAX_LOG_CHARS) {
      record.logsTruncated = true;

      return;
    }

    const text = render();
    const room = MAX_LOG_CHARS - record.logChars;
    const kept = text.length > room ? text.slice(0, room) : text;

    record.logs.push({ stream, text: kept, at: Date.now() });
    record.logChars += kept.length;
    record.logsTruncated = kept !== text;
  }

  /** Runs `fn` with `record` as the current record. Plain call when disabled. */
  public run<T>(record: DevtoolsOpenRecord, fn: () => T): T {
    return this.storage ? this.storage.run(record, fn) : fn();
  }

  /** Delivers the finished record to the listener, if there is one. */
  public close(record: DevtoolsOpenRecord, status: number, answeredBy?: DevtoolsRequestStep): void {
    const listener = this.listener;
    const answer = answeredBy ?? record.steps.at(-1);

    record.closed = true;

    if (!listener || !answer) {
      return;
    }

    listener({
      id: record.id,
      startedAt: record.startedAt,
      method: record.method,
      path: record.path,
      status,
      durationMs: performance.now() - record.startTime,
      steps: [...record.steps],
      answeredBy: answer,
      ...(record.logs.length > 0 && { logs: [...record.logs] }),
      ...(record.logsTruncated && { logsTruncated: true as const }),
    });
  }

  /**
   * Frames a non-HTTP dispatch (`@On`, `@Schedule`, `@MessagePattern`, `@EventPattern`) as a record
   * of its own: 200 when it settles, 500 when it fails. A failure is rethrown unchanged, and a
   * synchronous throw stays synchronous.
   *
   * @param method - What kind of dispatch, e.g. `@On`
   * @param path - The event, pattern or job name
   * @param handler - `Component.method` of the handler
   */
  public observe<T>(method: string, path: string, handler: string, fn: () => T): T {
    const record = this.open(method, path);
    const handlerStep: DevtoolsRequestStep = { kind: 'controller', name: handler };

    record.steps.push(handlerStep);

    let result: T;

    try {
      result = this.run(record, fn);
    } catch (error) {
      this.close(record, 500, handlerStep);
      throw error;
    }

    if (!(result instanceof Promise)) {
      this.close(record, 200);

      return result;
    }

    return result.then(
      (value) => {
        this.close(record, 200);

        return value;
      },
      (error: unknown) => {
        this.close(record, 500, handlerStep);
        throw error;
      },
    ) as T;
  }
}

export const devtoolsBus = new DevtoolsBus();
