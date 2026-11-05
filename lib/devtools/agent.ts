import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { computeReadiness } from '../server/health/readiness';
import { captureRequestOutput } from './capture';
import type { DevtoolsAttachment, DevtoolsServerContext } from './context';
import {
  agentMessage,
  isDevtoolsHostMessage,
  type DevtoolsAgentMessage,
  type DevtoolsCommandRequest,
  type DevtoolsCommandResult,
  type DevtoolsMetrics,
  type DevtoolsTransport,
} from './protocol';
import { buildDevtoolsSnapshot } from './snapshot';

/** How the agent talks to the console host. Defaults to the process IPC channel. */
export interface DevtoolsChannel {
  send(message: DevtoolsAgentMessage): void;
  /** @returns Removes the listener */
  onMessage(listener: (message: unknown) => void): () => void;
}

export interface DevtoolsAgentOptions {
  channel?: DevtoolsChannel;
  /** @default 1000 */
  sampleIntervalMs?: number;
}

const processChannel: DevtoolsChannel = {
  send: (message) => {
    process.send?.(message);
  },
  onMessage: (listener) => {
    process.on('message', listener);

    return () => {
      process.off('message', listener);
    };
  },
};

let warnedInert = false;

// Walks up rather than using a fixed depth: the file runs from lib/ in tests and from dist/lib/ when published.
const readCoreVersion = (): string => {
  for (let dir = import.meta.dir; ; dir = dirname(dir)) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };

      if (manifest.name === '@asenajs/asena' && manifest.version) {
        return manifest.version;
      }
    } catch {
      // No manifest here; keep walking.
    }

    if (dirname(dir) === dir) {
      return 'unknown';
    }
  }
};

const describeFailure = (error: unknown): { name: string; message: string } =>
  error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: typeof error, message: Bun.inspect(error) };

const describeTransports = (context: DevtoolsServerContext): DevtoolsTransport[] =>
  [...context.ulak.getMicroserviceTransports()].map(([name, transport]) => ({
    name,
    connected: transport.isConnected,
  }));

const runCommand = async (
  context: DevtoolsServerContext,
  request: DevtoolsCommandRequest,
): Promise<DevtoolsCommandResult> => {
  const { id } = request;

  try {
    switch (request.command) {
      case 'runSchedule':
        await context.cron.runNow(request.name);

        return { id, ok: true, result: { ran: request.name } };
      case 'emitEvent':
        return { id, ok: true, result: { delivered: context.events.emit(request.event, request.data) } };
      case 'sendMessage':
        if (request.kind === 'message') {
          const reply = await context.ulak.send(request.pattern, request.data, { transport: request.transport });

          return { id, ok: true, result: { reply } };
        }

        await context.ulak.emit(request.pattern, request.data, { transport: request.transport });

        return { id, ok: true, result: { emitted: true } };
      default:
        return {
          id,
          ok: false,
          error: {
            name: 'Error',
            message: `Unknown command ${JSON.stringify((request as { command: unknown }).command)}`,
          },
        };
    }
  } catch (error) {
    return { id, ok: false, error: describeFailure(error) };
  }
};

/**
 * The devtools agent. `asena console` sets it as the `globalThis[Symbol.for('asena.devtools')]` hook,
 * and `AsenaServer.start()` calls it once the server is ready.
 *
 * Sends `hello` and the snapshot, then a metrics sample every second and every record the bus
 * closes, with what the app wrote to the console and the std streams while that record was in
 * scope, and answers the host's commands through the app's real dispatch paths. It opens no port
 * and registers nothing; `detach` puts the console and stream functions back. Called without an
 * IPC channel it does nothing and says so once.
 *
 * @param context - The server, as `AsenaServer.start()` hands it over
 * @param options - Channel and sample interval, for tests
 * @returns What the server calls on stop: it releases the IPC listener so the process can exit
 */
export const attachDevtoolsAgent = (
  context: DevtoolsServerContext,
  options: DevtoolsAgentOptions = {},
): DevtoolsAttachment => {
  if (!options.channel && typeof process.send !== 'function') {
    if (!warnedInert) {
      warnedInert = true;
      console.warn('[devtools] agent not attached: this process has no IPC channel (start it with `asena console`)');
    }

    return { detach: () => undefined };
  }

  const channel = options.channel ?? processChannel;
  const interval = options.sampleIntervalMs ?? 1000;

  const send = (message: DevtoolsAgentMessage): boolean => {
    try {
      channel.send(message);

      return true;
    } catch {
      return false;
    }
  };

  send(
    agentMessage('hello', {
      coreVersion: readCoreVersion(),
      adapter: context.adapter,
      port: context.port,
      pid: process.pid,
      transports: describeTransports(context),
    }),
  );
  send(agentMessage('snapshot', buildDevtoolsSnapshot(context.container, context)));

  const unsubscribe = context.bus.subscribe((record) => {
    send(agentMessage('request', record));
  });
  const releaseOutput = captureRequestOutput(context.bus);

  let lastCpu = process.cpuUsage();
  let lastAt = performance.now();

  const sample = (): DevtoolsMetrics => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    const elapsedMs = now - lastAt;
    const memory = process.memoryUsage();

    lastCpu = process.cpuUsage();
    lastAt = now;

    return {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      cpuPercent: elapsedMs > 0 ? (cpu.user + cpu.system) / 10 / elapsedMs : 0,
      // How late this tick fired: the event loop was busy for that long.
      eventLoopLagMs: Math.max(0, elapsedMs - interval),
      uptimeSeconds: Math.round(process.uptime()),
      readiness: computeReadiness(context.lifecycle.state, context.ulak.getMicroserviceTransports()),
      transports: describeTransports(context),
    };
  };

  const sampler = setInterval(() => {
    send(agentMessage('metrics', sample()));
  }, interval);

  sampler.unref();

  const removeListener = channel.onMessage((message) => {
    if (!isDevtoolsHostMessage(message) || message.type !== 'command') {
      return;
    }

    void runCommand(context, message.payload).then((result) => {
      if (!send(agentMessage('commandResult', result)) && result.ok) {
        send(
          agentMessage('commandResult', {
            id: result.id,
            ok: false,
            error: { name: 'DataCloneError', message: 'The result could not be sent over IPC' },
          }),
        );
      }
    });
  });

  return {
    detach: () => {
      clearInterval(sampler);
      unsubscribe();
      releaseOutput();
      removeListener();
    },
  };
};
