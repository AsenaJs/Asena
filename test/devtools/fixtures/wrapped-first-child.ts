// Spawned by capture-process.test.ts with an IPC channel. Unlike under the `asena console` prelude, the app
// replaces console.log and console.warn before the capture module first loads, so the patch cannot sit below
// them. The modules are imported dynamically because static imports would run before these assignments.
const redact = (arg: unknown): unknown =>
  typeof arg === 'string' ? arg.replaceAll(/token=\S+/g, 'token=[redacted]') : arg;
const appLog = console.log;

console.log = (...args: unknown[]) => appLog(...args.map(redact));
console.warn = (...args: unknown[]) => {
  process.stderr.write(`${args.map(redact).join(' ')}\n`);
};

const { captureRequestOutput } = await import('../../../lib/devtools/capture');
const { DevtoolsBus } = await import('../../../lib/devtools/DevtoolsBus');

const bus = new DevtoolsBus();
let logs: unknown;

bus.enable();
bus.subscribe((record) => {
  logs = record.logs;
});
captureRequestOutput(bus);

const record = bus.open('GET', '/wrapped-first');

bus.run(record, () => {
  console.log('log token=SECRET');
  console.warn('warn token=SECRET');
  console.info('info line');
});
bus.close(record, 200, { kind: 'controller', name: 'WrappedFirst.run' });

process.send!({ fixture: 'logs', logs }, () => process.exit(0));
