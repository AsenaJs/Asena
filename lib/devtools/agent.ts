import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { computeReadiness } from '../server/health/readiness';
import { LifecycleState } from '../server/lifecycle/LifecycleState';
import { describeErrorChain } from '../utils/errorChain';
import { captureRequestOutput } from './capture';
import { devtoolsRefusal, type DevtoolsAttachment, type DevtoolsServerContext } from './context';
import {
  agentMessage,
  isDevtoolsHostMessage,
  type DevtoolsAgentMessage,
  type DevtoolsCommand,
  type DevtoolsCommandRequest,
  type DevtoolsCommandResult,
  type DevtoolsMetrics,
  type DevtoolsTransport,
} from './protocol';
import { buildDevtoolsSnapshot } from './snapshot';

/**
 * How the agent talks to the console host: the process IPC channel, or a test double. The peer is
 * trusted with every command, so this never leaves the package.
 * @internal
 */
export interface DevtoolsChannel {
  /** Throws when the message cannot be serialised; otherwise calls `flushed` once it has left the process. */
  send(message: DevtoolsAgentMessage, flushed: () => void): void;
  /** @returns Removes the listener */
  onMessage(listener: (message: unknown) => void): () => void;
}

/** @internal Test seams; the console calls {@link attachDevtoolsAgent} with the context alone. */
export interface DevtoolsAgentOptions {
  channel?: DevtoolsChannel;
  /** @default 1000 */
  sampleIntervalMs?: number;
  /**
   * Sent but not yet flushed messages above which request records and metrics are dropped.
   * @default 1000
   */
  maxPendingMessages?: number;
}

const processChannel: DevtoolsChannel = {
  send: (message, flushed) => {
    process.send?.(message, undefined, undefined, () => flushed());
  },
  onMessage: (listener) => {
    process.on('message', listener);

    return () => {
      process.off('message', listener);
    };
  },
};

interface HostSpeaker {
  listen(): void;
  unlisten(): void;
}

// On globalThis rather than in module scope: a `--hot` reload evaluates a fresh copy of this module.
const HOST_SPEAKERS = Symbol.for('asena.devtools.hostSpeakers');

/**
 * Only the most recent live attachment speaks to the host: it alone listens for commands and sends
 * records and metrics, so the host gets each once however many servers the process holds. When it
 * detaches, the one before it takes over.
 *
 * @returns Releases the claim
 */
const claimHost = (claimant: HostSpeaker): (() => void) => {
  const slot = globalThis as Record<symbol, unknown>;
  const stack = (slot[HOST_SPEAKERS] ??= []) as HostSpeaker[];

  stack.at(-1)?.unlisten();
  stack.push(claimant);
  claimant.listen();

  return () => {
    const index = stack.indexOf(claimant);

    if (index === -1) {
      return;
    }

    stack.splice(index, 1);

    if (index === stack.length) {
      claimant.unlisten();
      stack.at(-1)?.listen();
    }
  };
};

const warned = new Set<string>();

const inert = (reason: string): DevtoolsAttachment => {
  if (!warned.has(reason)) {
    warned.add(reason);
    console.warn(`[devtools] agent not attached: ${reason}`);
  }

  return { detach: () => undefined };
};

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

const failed = (id: string, message: string): DevtoolsCommandResult => ({
  id,
  ok: false,
  error: { name: 'Error', message },
});

const REQUIRED_STRINGS = {
  runSchedule: ['name'],
  emitEvent: ['event'],
  sendMessage: ['transport', 'pattern'],
} as const satisfies Record<DevtoolsCommand['command'], readonly string[]>;

/** @returns Why the command cannot run as sent, or `undefined` when its required fields are strings. */
const wrongField = (request: DevtoolsCommandRequest): string | undefined => {
  if (!Object.hasOwn(REQUIRED_STRINGS, request.command)) {
    return undefined;
  }

  for (const field of REQUIRED_STRINGS[request.command]) {
    const value = (request as unknown as Record<string, unknown>)[field];

    if (typeof value !== 'string') {
      return `${request.command} needs a string "${field}", got ${value === null ? 'null' : typeof value}`;
    }
  }

  return undefined;
};

const runCommand = async (
  context: DevtoolsServerContext,
  request: DevtoolsCommandRequest,
): Promise<DevtoolsCommandResult> => {
  let id = '';

  try {
    id = request.id;

    if (context.lifecycle.state !== LifecycleState.STARTED) {
      return failed(id, 'The server is stopping; the command was not run');
    }

    const refusal = wrongField(request);

    if (refusal) {
      return failed(id, refusal);
    }

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

        if (request.kind !== 'event') {
          return failed(id, `Unknown sendMessage kind ${JSON.stringify(request.kind)}`);
        }

        await context.ulak.emit(request.pattern, request.data, { transport: request.transport });

        return { id, ok: true, result: { emitted: true } };
      default:
        return failed(id, `Unknown command ${JSON.stringify((request as { command: unknown }).command)}`);
    }
  } catch (error) {
    return { id, ok: false, error: describeFailure(error) };
  }
};

/**
 * The devtools agent. `asena console` sets it as the `globalThis[Symbol.for('asena.devtools')]` hook,
 * and `AsenaServer.start()` calls it once the server is ready.
 *
 * Sends `hello` and the snapshot. The most recent attachment in the process also sends a metrics
 * sample every second and every record the bus closes, with what the app wrote to the console and
 * the std streams while that record was in scope, and answers the host's commands through the
 * app's real dispatch paths. It opens no port and registers nothing; `detach` puts the console and
 * stream functions back. Called without an IPC channel, or with `NODE_ENV=production`, it does
 * nothing and says so once.
 *
 * @param context - The server, as `AsenaServer.start()` hands it over
 * @returns What the server calls on stop: it releases the IPC listener so the process can exit
 */
export const attachDevtoolsAgent = (context: DevtoolsServerContext): DevtoolsAttachment => startDevtoolsAgent(context);

/** @internal {@link attachDevtoolsAgent} with its test seams. */
export const startDevtoolsAgent = (
  context: DevtoolsServerContext,
  options: DevtoolsAgentOptions = {},
): DevtoolsAttachment => {
  const refusal = devtoolsRefusal();

  if (refusal) {
    return inert(refusal);
  }

  if (!options.channel && typeof process.send !== 'function') {
    return inert('this process has no IPC channel (start it with `asena console`)');
  }

  const channel = options.channel ?? processChannel;
  const interval = options.sampleIntervalMs ?? 1000;
  const maxPending = options.maxPendingMessages ?? 1000;
  let pending = 0;
  let dropped = 0;
  let speaking = false;

  const send = (message: DevtoolsAgentMessage): boolean => {
    pending += 1;

    try {
      channel.send(message, () => {
        pending -= 1;
      });

      return true;
    } catch {
      pending -= 1;

      return false;
    }
  };

  // Commands, hello and the snapshot are always sent: the host asked for them, and they are few.
  const sendTelemetry = (message: DevtoolsAgentMessage): void => {
    if (!speaking) {
      return;
    }

    if (pending >= maxPending) {
      dropped += 1;
    } else {
      send(message);
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
    sendTelemetry(agentMessage('request', record));
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
      ...(dropped > 0 && { dropped }),
    };
  };

  const sampler = setInterval(() => {
    let metrics: DevtoolsMetrics;

    try {
      metrics = sample();
    } catch {
      return;
    }

    sendTelemetry(agentMessage('metrics', metrics));
  }, interval);

  sampler.unref();

  const onCommand = (message: unknown): void => {
    if (!isDevtoolsHostMessage(message) || message.type !== 'command') {
      return;
    }

    const { id, command } = message.payload;

    void runCommand(context, message.payload)
      .then((result) => {
        if (!send(agentMessage('commandResult', result)) && result.ok) {
          send(
            agentMessage('commandResult', {
              id: result.id,
              ok: false,
              error: { name: 'DataCloneError', message: 'The result could not be sent over IPC' },
            }),
          );
        }
      })
      .catch((error: unknown) => {
        try {
          context.logger.warn(
            `[devtools] command ${JSON.stringify(id)} (${String(command)}) failed outside its handler: ${describeErrorChain(error)}`,
          );
        } catch {
          // Nothing left to report through; the app must stay up.
        }

        send(
          agentMessage(
            'commandResult',
            failed(id, 'The command failed and the agent could not turn its error into a result'),
          ),
        );
      });
  };

  let removeListener: (() => void) | undefined;
  const releaseHost = claimHost({
    listen: () => {
      speaking = true;
      removeListener ??= channel.onMessage(onCommand);
    },
    unlisten: () => {
      speaking = false;
      removeListener?.();
      removeListener = undefined;
    },
  });

  return {
    detach: () => {
      clearInterval(sampler);
      unsubscribe();
      releaseOutput();
      releaseHost();
    },
  };
};
