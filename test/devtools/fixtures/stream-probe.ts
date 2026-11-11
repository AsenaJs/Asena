// Spawned by capture-process.test.ts: reports over IPC which output functions each call reaches on this runtime.
const METHODS = ['log', 'info', 'debug', 'trace', 'warn', 'error'] as const;
const reached: string[] = [];

for (const method of METHODS) {
  const original = console[method];

  console[method] = (...args: unknown[]) => {
    reached.push(`console.${method}`);
    original.apply(console, args);
  };
}

for (const stream of ['stdout', 'stderr'] as const) {
  const original = process[stream].write;

  process[stream].write = function (this: unknown, ...args: unknown[]) {
    reached.push(`process.${stream}.write`);

    return (original as (...rest: unknown[]) => boolean).apply(this, args);
  } as typeof original;
}

const report: Record<string, string[]> = {};

for (const method of METHODS) {
  reached.length = 0;
  console[method](`probe ${method}`);
  report[`console.${method}`] = [...reached];
}

for (const stream of ['stdout', 'stderr'] as const) {
  reached.length = 0;
  process[stream].write(`probe ${stream}\n`);
  report[`process.${stream}.write`] = [...reached];
}

process.send!(report);
process.disconnect?.();
