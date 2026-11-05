import { format } from 'node:util';
import type { DevtoolsBus } from './DevtoolsBus';
import type { DevtoolsRequestLog } from './protocol';

type Stream = DevtoolsRequestLog['stream'];

// Where Bun prints each; none of them goes through process.stdout/stderr.write (capture-process.test.ts).
const CONSOLE_STREAMS = {
  log: 'stdout',
  info: 'stdout',
  debug: 'stdout',
  trace: 'stdout',
  warn: 'stderr',
  error: 'stderr',
} as const satisfies Record<string, Stream>;

type ConsoleMethod = keyof typeof CONSOLE_STREAMS;

const decoder = new TextDecoder();

// Bun's console prints every non-string through Bun.inspect; util.format only resolves printf specifiers.
const formatArgs = (args: unknown[]): string =>
  typeof args[0] === 'string' && /%[sdifoOjc%]/.test(args[0])
    ? format(...args)
    : args.map((arg) => (typeof arg === 'string' ? arg : Bun.inspect(arg))).join(' ');

const traceText = (args: unknown[], below: (...args: never[]) => unknown): string => {
  const holder: { stack?: string } = {};

  Error.captureStackTrace(holder, below);

  const frames = (holder.stack ?? '')
    .split('\n')
    .slice(1)
    .map((frame) => `      ${frame.trim()}`);

  return `${[formatArgs(args), ...frames].join('\n')}\n`;
};

const chunkText = (chunk: unknown): string =>
  typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? decoder.decode(chunk) : Bun.inspect(chunk);

/**
 * Wraps `console.*` and `process.stdout/stderr.write` so that a write made inside a bus record's
 * async scope is also appended to that record. The original function still receives every call.
 *
 * @returns Puts each original back, unless something replaced the wrapper since
 */
export const captureRequestOutput = (bus: DevtoolsBus): (() => void) => {
  const restores: (() => void)[] = [];
  let inConsole = false;

  const capture = (stream: Stream, render: () => string): void => {
    try {
      bus.captureOutput(stream, render);
    } catch {
      // The app's own write must go through even when its arguments cannot be rendered.
    }
  };

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
      const captured = (...args: unknown[]): void => {
        const outermost = !inConsole;

        // Keeps the line single on a runtime whose console writes through process.stdout.write.
        if (outermost) {
          inConsole = true;
          capture(stream, () => (method === 'trace' ? traceText(args, captured) : `${formatArgs(args)}\n`));
        }

        try {
          original.apply(console, args);
        } finally {
          if (outermost) {
            inConsole = false;
          }
        }
      };

      return captured;
    });
  }

  for (const stream of ['stdout', 'stderr'] as const) {
    replace(process[stream], 'write', (original) => {
      return function captured(this: unknown, ...args: unknown[]): boolean {
        if (!inConsole) {
          capture(stream, () => chunkText(args[0]));
        }

        return original.apply(this, args);
      };
    });
  }

  return () => {
    for (const restore of restores.reverse()) {
      restore();
    }
  };
};
