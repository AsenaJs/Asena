// Spawned by agent-process.test.ts with an IPC channel, the way `asena console` spawns the app.
import { attachDevtoolsAgent, DEVTOOLS_HOOK } from '../../../lib/devtools';
import { AsenaServerFactory } from '../../../lib/server';
import { silentLogger } from '../../../lib/test/harness/silentLogger';
import { consoleAppComponents } from './console-app';

(globalThis as Record<symbol, unknown>)[DEVTOOLS_HOOK] = attachDevtoolsAgent;

const server = await AsenaServerFactory.create({
  headless: true,
  logger: silentLogger,
  components: consoleAppComponents,
});

await server.start();
