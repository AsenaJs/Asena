import { format } from 'node:util';
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

// Bun's console prints every non-string through Bun.inspect; util.format only resolves printf specifiers.
const formatArgs = (args: unknown[]): string =>
  typeof args[0] === 'string' && /%[sdifoOjc%]/.test(args[0])
    ? format(...args)
    : args.map((arg) => (typeof arg === 'string' ? arg : Bun.inspect(arg))).join(' ');

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

const render = (method: ConsoleMethod, args: unknown[], below: (...args: never[]) => unknown): Rendered => {
  switch (method) {
    case 'trace': {
      const body = formatArgs(args);

      return { text: traceText(body, below), forward: ['%s', body] };
    }
    case 'dir': {
      const [value, options] = args;
      const body = typeof value === 'string' ? value : Bun.inspect(value, options);

      return { text: `${body}\n`, forward: [body] };
    }
    case 'table': {
      const [data, properties] = args;
      const text =
        typeof data === 'object' && data !== null
          ? Bun.inspect.table(data, properties as string[] | undefined)
          : `${formatArgs([data])}\n`;

      return { text, forward: [text.slice(0, -1)] };
    }
    case 'assert': {
      const [condition, ...message] = args;
      const rendered = line(message.length > 0 ? formatArgs(message) : 'Assertion failed');

      return { text: rendered.text, forward: [condition, ...rendered.forward] };
    }
    default:
      return line(formatArgs(args));
  }
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

const install = (): (() => void) => {
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

          // The record's text goes out in place of the arguments, so nothing in them is inspected twice.
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

// Also installed at import, inert until a capture is taken: the `asena console` prelude imports this module
// before the entry, so a console wrapper the app installs later sits above it and its redaction is captured.
if (typeof process.send === 'function') {
  uninstall = install();
}

/**
 * Makes a write made inside a record's async scope also land on that record. `console.*` and
 * `process.stdout/stderr.write` are patched once for the whole process, however many captures are held,
 * and the patch is removed when the last one is released. The original function still receives every
 * call; inside a record, a console method gets the rendered text instead of the arguments.
 *
 * @returns Releases this capture; calling it again does nothing
 */
export const captureRequestOutput = (bus: DevtoolsBus): (() => void) => {
  let released = false;

  holders.set(bus, (holders.get(bus) ?? 0) + 1);
  uninstall ??= install();

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

    if (holders.size === 0) {
      uninstall?.();
      uninstall = undefined;
    }
  };
};
