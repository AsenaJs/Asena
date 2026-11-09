// Spawned by capture-process.test.ts with an IPC channel. The capture module loads first, as under the
// `asena console` prelude, then the app wraps console.log; the capture is released and taken again, as a
// stop and a later start in the same process do.
import { captureRequestOutput } from '../../../lib/devtools/capture';
import { DevtoolsBus } from '../../../lib/devtools/DevtoolsBus';
import type { DevtoolsRequestRecord } from '../../../lib/devtools/protocol';

const redact = (arg: unknown): unknown =>
  typeof arg === 'string' ? arg.replaceAll(/token=\S+/g, 'token=[redacted]') : arg;
const appLog = console.log;

console.log = (...args: unknown[]) => appLog(...args.map(redact));

const bus = new DevtoolsBus();
const records: DevtoolsRequestRecord[] = [];

bus.enable();
bus.subscribe((record) => records.push(record));

const runs = ['/first', '/again'].map((path) => {
  const release = captureRequestOutput(bus);
  const record = bus.open('GET', path);

  bus.run(record, () => console.log(`${path} token=SECRET`));
  bus.close(record, 200, { kind: 'controller', name: 'Reattach.run' });
  release();

  return records.at(-1)!.logs;
});

process.send!({ fixture: 'logs', runs }, () => process.exit(0));
