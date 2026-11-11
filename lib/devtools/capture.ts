import { format, types } from 'node:util';
import type { DevtoolsBus, DevtoolsOpenRecord } from './DevtoolsBus';
import type { DevtoolsRequestLog } from './protocol';

type Stream = DevtoolsRequestLog['stream'];

// Where Bun prints each; none of them goes through process.stdout/stderr.write (capture-process.test.ts).
// Not captured: count, time*, and the group label and indent, which Bun prints without these methods.
const CONSOLE_STREAMS = {
  log: 'stdout',
  info: 'stdout',
  debug: 'stdout',
  trace: 'stdout',
  dir: 'stdout',
  table: 'stdout',
  warn: 'stderr',
  error: 'stderr',
  assert: 'stderr',
} as const satisfies Record<string, Stream>;

type ConsoleMethod = keyof typeof CONSOLE_STREAMS;

/** What the record keeps, and the arguments the original console method gets instead of the app's. */
interface Rendered {
  text: string;
  forward: unknown[];
}

const hasSpecifier = (args: unknown[]): boolean => typeof args[0] === 'string' && /%[sdifoOjc%]/.test(args[0]);

// Bun's console prints every non-string through Bun.inspect; util.format only resolves printf specifiers.
const formatArgs = (args: unknown[]): string =>
  hasSpecifier(args)
    ? format(...args)
    : args.map((arg) => (typeof arg === 'string' ? arg : Bun.inspect(arg))).join(' ');

const PLAIN_PROTOTYPES = new Set<unknown>([Object.prototype, Array.prototype, null]);
const PLAIN_NODE_LIMIT = 256;

/**
 * Whether inspecting `args` can run no app code: primitives, and plain objects and arrays of them with
 * data properties only. Such arguments can be printed by the console as well as rendered for the record.
 */
const isPlainData = (args: unknown[]): boolean => {
  const seen = new Set<object>();
  const pending: unknown[] = [...args];

  while (pending.length > 0) {
    const value = pending.pop();

    if (typeof value === 'function') {
      return false;
    }

    if (typeof value !== 'object' || value === null || seen.has(value)) {
      continue;
    }

    if (seen.size === PLAIN_NODE_LIMIT || types.isProxy(value) || !PLAIN_PROTOTYPES.has(Object.getPrototypeOf(value))) {
      return false;
    }

    seen.add(value);

    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (typeof key === 'symbol' || !('value' in descriptor)) {
        return false;
      }

      pending.push(descriptor.value);
    }
  }

  return true;
};

const line = (body: string): Rendered => ({ text: `${body}\n`, forward: ['%s', body] });

const traceText = (body: string, below: (...args: never[]) => unknown): string => {
  const holder: { stack?: string } = {};

  Error.captureStackTrace(holder, below);

  const frames = (holder.stack ?? '')
    .split('\n')
    .slice(1)
    .map((frame) => `      ${frame.trim()}`);

  return `${[body, ...frames].join('\n')}\n`;
};

interface Rendering extends Rendered {
  /** The arguments the console resolves printf specifiers in. */
  formatted: unknown[];
}

const renderText = (method: ConsoleMethod, args: unknown[], below: (...args: never[]) => unknown): Rendering => {
  switch (method) {
    case 'trace': {
      const body = formatArgs(args);

      return { text: traceText(body, below), forward: ['%s', body], formatted: args };
    }
    case 'dir': {
      const [value, options] = args;
      const body = typeof value === 'string' ? value : Bun.inspect(value, options);

      return { text: `${body}\n`, forward: [body], formatted: [] };
    }
    case 'table': {
      const [data, properties] = args;
      const text =
        typeof data === 'object' && data !== null
          ? Bun.inspect.table(data, properties as string[] | undefined)
          : `${formatArgs([data])}\n`;

      return { text, forward: [text.slice(0, -1)], formatted: [] };
    }
    case 'assert': {
      const [condition, ...message] = args;
      const rendered = line(message.length > 0 ? formatArgs(message) : 'Assertion failed');

      return { text: rendered.text, forward: [condition, ...rendered.forward], formatted: message };
    }
    default:
      return { ...line(formatArgs(args)), formatted: args };
  }
};

// The console prints plain data the way the record holds it, so it keeps the app's own arguments.
const render = (method: ConsoleMethod, args: unknown[], below: (...args: never[]) => unknown): Rendered => {
  const { text, forward, formatted } = renderText(method, args, below);

  return { text, forward: !hasSpecifier(formatted) && isPlainData(args) ? args : forward };
};

/** Runs `fn` at most once; later calls get the same value, or the same error. */
const once = <T>(fn: () => T): (() => T) => {
  let outcome: { value: T } | { error: unknown } | undefined;

  return () => {
    if (!outcome) {
      try {
        outcome = { value: fn() };
      } catch (error) {
        outcome = { error };
      }
    }

    if ('error' in outcome) {
      throw outcome.error;
    }

    return outcome.value;
  };
};

const decoders = new WeakMap<DevtoolsOpenRecord, Partial<Record<Stream, TextDecoder>>>();

const chunkText = (record: DevtoolsOpenRecord, stream: Stream, chunk: unknown): string => {
  if (typeof chunk === 'string') {
    return chunk;
  }

  if (!(chunk instanceof Uint8Array)) {
    return Bun.inspect(chunk);
  }

  let own = decoders.get(record);

  if (!own) {
    own = {};
    decoders.set(record, own);
  }

  own[stream] ??= new TextDecoder();

  return own[stream].decode(chunk, { stream: true });
};

const holders = new Map<DevtoolsBus, number>();
let inConsole = false;
let uninstall: (() => void) | undefined;

const capture = (stream: Stream, text: (record: DevtoolsOpenRecord) => string): void => {
  for (const bus of holders.keys()) {
    try {
      bus.captureOutput(stream, text);
    } catch {
      // The app's own write must go through even when its arguments cannot be rendered.
    }
  }
};

const isNative = (fn: unknown): boolean =>
  typeof fn === 'function' &&
  !types.isProxy(fn) &&
  !fn.name.startsWith('bound ') &&
  /\[native code\]\s*\}$/.test(Function.prototype.toString.call(fn));

const install = (onlyNative: boolean): (() => void) => {
  const restores: (() => void)[] = [];
  let live = true;

  const replace = <T extends object, K extends keyof T>(target: T, key: K, wrap: (original: T[K]) => T[K]): void => {
    const original = target[key];
    const wrapper = wrap(original);

    target[key] = wrapper;
    restores.push(() => {
      if (target[key] === wrapper) {
        target[key] = original;
      }
    });
  };

  for (const method of Object.keys(CONSOLE_STREAMS) as ConsoleMethod[]) {
    const stream = CONSOLE_STREAMS[method];

    if (onlyNative && !isNative(Reflect.get(console, method))) {
      continue;
    }

    replace(console, method, (original) => {
      const captured = (...args: unknown[]): unknown => {
        // A passed console.assert prints nothing.
        if (!live || inConsole || holders.size === 0 || (method === 'assert' && args[0])) {
          return original.apply(console, args);
        }

        // Keeps the line single on a runtime whose console writes through process.stdout.write.
        inConsole = true;

        try {
          const rendered = once(() => render(method, args, captured));
          let taken: Rendered | undefined;

          capture(stream, () => {
            taken = rendered();

            return taken.text;
          });

          // Arguments that could run code when inspected go out as the record's text, so they run once.
          return original.apply(console, taken ? taken.forward : args);
        } finally {
          inConsole = false;
        }
      };

      return captured as typeof original;
    });
  }

  for (const stream of ['stdout', 'stderr'] as const) {
    replace(process[stream], 'write', (original) => {
      return function captured(this: unknown, ...args: unknown[]): boolean {
        if (live && !inConsole) {
          capture(stream, (record) => chunkText(record, stream, args[0]));
        }

        return original.apply(this, args);
      };
    });
  }

  return () => {
    live = false;

    for (const restore of restores.reverse()) {
      restore();
    }
  };
};

// Installed at import and never removed, inert while no capture is held: a console wrapper the app
// installs at any later time sits above it.
const pinned = typeof process.send === 'function';

if (pinned) {
  uninstall = install(true);
}

/**
 * Makes a write made inside a record's async scope also land on that record. `console.*` and
 * `process.stdout/stderr.write` are patched once for the whole process, however many captures are held.
 * With an IPC channel the patch is installed at import and kept; without one it is removed when the last
 * capture is released. With an IPC channel, a console method already replaced when this module loads is
 * left alone. Wrapping it would record the arguments before the app's replacement redacts them, and what
 * the replacement passes on to the native method it saved cannot be observed: Bun's console writes to the
 * descriptor without calling `process.stdout/stderr.write`. A line printed through such a replacement is
 * in the record only when the replacement writes to those streams. A console method replaced after this
 * module loads is recorded as the replacement prints it.
 * The original function still receives every call; inside a record, a console method whose arguments
 * are not plain data, or that formats printf specifiers, gets the rendered text instead.
 *
 * @returns Releases this capture; calling it again does nothing
 */
export const captureRequestOutput = (bus: DevtoolsBus): (() => void) => {
  let released = false;

  holders.set(bus, (holders.get(bus) ?? 0) + 1);
  uninstall ??= install(false);

  return () => {
    if (released) {
      return;
    }

    released = true;

    const left = (holders.get(bus) ?? 1) - 1;

    if (left > 0) {
      holders.set(bus, left);
    } else {
      holders.delete(bus);
    }

    if (holders.size === 0 && !pinned) {
      uninstall?.();
      uninstall = undefined;
    }
  };
};
