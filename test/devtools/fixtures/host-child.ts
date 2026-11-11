// Spawned by host-process.test.ts with an IPC channel, the way `asena console` spawns the app.
// HOST_CHILD_SERVERS sets how many servers it starts (default 1). Besides the devtools protocol it
// takes `{ fixture: ... }` control messages, so the test can act inside the child and read its state.
import { writeFileSync } from 'node:fs';
import { attachDevtoolsAgent, DEVTOOLS_HOOK } from '../../../lib/devtools';
import type { DevtoolsHook } from '../../../lib/devtools/context';
import { devtoolsBus } from '../../../lib/devtools/DevtoolsBus';
import { ICoreServiceNames } from '../../../lib/ioc';
import { AsenaServerFactory } from '../../../lib/server';
import { Config, EventService } from '../../../lib/server/decorators';
import { On, type EventEmitter } from '../../../lib/server/event';
import { InMemoryTransport } from '../../../lib/server/microservice';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

let hookCalls = 0;
const received: string[] = [];

const hook: DevtoolsHook = (context) => {
  hookCalls += 1;

  return attachDevtoolsAgent(context);
};

(globalThis as Record<symbol, unknown>)[DEVTOOLS_HOOK] = hook;

@EventService('first')
class FirstEvents {
  @On('ping')
  public ping(event: string) {
    received.push(event);
  }

  @On({ event: 'bulk.*', prefix: false })
  public bulk() {}
}

@EventService('second')
class SecondEvents {
  @On('ping')
  public ping(event: string) {
    received.push(event);
  }
}

// Only the second server has a transport, which is what tells its hello and metrics from the first's.
@Config()
class SecondConfig {
  public transport() {
    return { microservice: new InMemoryTransport() };
  }
}

const componentSets = [[FirstEvents], [SecondEvents, SecondConfig]];
const count = Number(process.env.HOST_CHILD_SERVERS ?? 1);
const servers = [];
const emitters: EventEmitter[] = [];

for (const components of componentSets.slice(0, count)) {
  const server = await AsenaServerFactory.create({ headless: true, logger: silentLogger, components });

  await server.start();
  servers.push(server);
  emitters.push(await server.resolve<EventEmitter>(ICoreServiceNames.EVENT_EMITTER));
}

type Control =
  | { fixture: 'ping'; n: number }
  | { fixture: 'state' }
  | { fixture: 'emit'; server: number; event: string }
  | { fixture: 'stop'; server: number }
  | { fixture: 'flood'; records: number; batch: number; doneFile: string }
  | { fixture: 'exitAfter'; ms: number };

const reply = (message: Record<string, unknown>) => process.send!({ fixture: 'reply', ...message });

const flood = (records: number, batch: number, doneFile: string) => {
  const event = `bulk.${'x'.repeat(2000)}`;
  let sent = 0;

  const next = () => {
    for (let index = 0; index < batch && sent < records; index += 1, sent += 1) {
      emitters[0].emit(event);
    }

    if (sent < records) {
      setTimeout(next, 0);
    } else {
      writeFileSync(doneFile, String(sent));
    }
  };

  next();
};

process.on('message', (message: unknown) => {
  if (typeof message !== 'object' || message === null || !('fixture' in message)) {
    return;
  }

  const control = message as Control;

  switch (control.fixture) {
    case 'ping':
      reply({ pong: control.n });
      break;
    case 'state':
      reply({ hookCalls, busEnabled: devtoolsBus.enabled, received: [...received] });
      break;
    case 'emit':
      reply({ delivered: emitters[control.server].emit(control.event) });
      break;
    case 'stop':
      void servers[control.server].stop().then(() => {
        reply({ stopped: control.server, busEnabled: devtoolsBus.enabled });
      });
      break;
    case 'flood':
      flood(control.records, control.batch, control.doneFile);
      break;
    case 'exitAfter':
      setTimeout(() => process.exit(0), control.ms);
      break;
  }
});

// Heartbeat for the tests that take the parent away: each tick is a record on its way to the host.
// Unreferenced, so only the framework decides how long the process lives.
if (process.env.HOST_CHILD_TICK_MS) {
  let ticks = 0;

  setInterval(() => {
    emitters[0].emit('first.ping');
    ticks += 1;
    console.log(`TICK ${ticks}`);
  }, Number(process.env.HOST_CHILD_TICK_MS)).unref();
}

if (process.env.HOST_CHILD_EXIT_FILE) {
  const exitFile = process.env.HOST_CHILD_EXIT_FILE;

  process.on('exit', (code) => {
    writeFileSync(exitFile, String(code));
  });
}

process.send!({ fixture: 'reply', ready: true });
