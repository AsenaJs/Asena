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
  type DevtoolsServerState,
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

/** One attached server, as the attachment that speaks for the process reaches it. */
interface HostSpeaker {
  readonly serverId: string;
  /** Starts listening for commands and sampling metrics on behalf of every attached server. */
  listen(): void;
  unlisten(): void;
  /** Throws when the server's state cannot be read. */
  state(): DevtoolsServerState;
  /** Runs the command on this server and sends its result. */
  answer(request: DevtoolsCommandRequest): void;
}

// On globalThis rather than in module scope: a `--hot` reload evaluates a fresh copy of this module.
const HOST_SPEAKERS = Symbol.for('asena.devtools.hostSpeakers');

/** Every attached server of the process, in the order they attached. */
const hostSpeakers = (): HostSpeaker[] => {
  const slot = globalThis as Record<symbol, unknown>;

  return (slot[HOST_SPEAKERS] ??= []) as HostSpeaker[];
};

/**
 * The most recent attachment speaks for the process: it alone listens for commands and samples
 * metrics, so the host gets one answer and one sample however many servers the process holds. When
 * it detaches, the one before it takes over.
 *
 * @returns Releases the claim
 */
const claimHost = (claimant: HostSpeaker): (() => void) => {
  const stack = hostSpeakers();

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

const failed = (id: string, message: string, serverId?: string): DevtoolsCommandResult => ({
  id,
  ...(serverId !== undefined && { serverId }),
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
 * Sends `hello` and the snapshot under the server's id, then every record that server's handlers
 * close, with what the app wrote to the console and the std streams while the record was in scope,
 * and answers the host's commands through the app's real dispatch paths. The most recent attachment
 * in the process listens for the commands of every attached server and sends one metrics sample a
 * second that carries each of them. It opens no port and registers nothing; `detach` tells the host
 * the server is gone and puts the console and stream functions back. Called without an IPC channel,
 * or with `NODE_ENV=production`, it does nothing and says so once.
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
  const { serverId } = context;
  let pending = 0;
  let dropped = 0;

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

  // Results, hello, the snapshot and serverStopped are always sent: the host needs them, and they are few.
  const sendTelemetry = (message: DevtoolsAgentMessage): void => {
    if (pending >= maxPending) {
      dropped += 1;
    } else {
      send(message);
    }
  };

  send(
    agentMessage('hello', {
      serverId,
      coreVersion: readCoreVersion(),
      adapter: context.adapter,
      port: context.port,
      pid: process.pid,
      transports: describeTransports(context),
    }),
  );
  send(agentMessage('snapshot', { ...buildDevtoolsSnapshot(context.container, context), serverId }));

  const unsubscribe = context.bus.subscribe((record, from) => {
    if (from === serverId) {
      sendTelemetry(agentMessage('request', { ...record, serverId }));
    }
  });
  const releaseOutput = captureRequestOutput(context.bus);

  const state = (): DevtoolsServerState => ({
    readiness: computeReadiness(context.lifecycle.state, context.ulak.getMicroserviceTransports()),
    transports: describeTransports(context),
    ...(dropped > 0 && { dropped }),
  });

  const answer = (request: DevtoolsCommandRequest): void => {
    const { id, command } = request;

    void runCommand(context, request)
      .then((outcome) => {
        const result = { ...outcome, serverId };

        if (!send(agentMessage('commandResult', result)) && result.ok) {
          send(
            agentMessage('commandResult', {
              id,
              serverId,
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
            failed(id, 'The command failed and the agent could not turn its error into a result', serverId),
          ),
        );
      });
  };

  let lastCpu = process.cpuUsage();
  let lastAt = performance.now();

  /** @returns `undefined` when no attached server's state could be read */
  const sample = (): DevtoolsMetrics | undefined => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    const elapsedMs = now - lastAt;
    const memory = process.memoryUsage();
    const servers: Record<string, DevtoolsServerState> = {};
    let latest: DevtoolsServerState | undefined;
    let droppedInAll = 0;

    lastCpu = process.cpuUsage();
    lastAt = now;

    for (const speaker of hostSpeakers()) {
      try {
        latest = speaker.state();
        servers[speaker.serverId] = latest;
        droppedInAll += latest.dropped ?? 0;
      } catch {
        // Teardown destroys transports while the sampler still ticks; that server is left out this once.
      }
    }

    return (
      latest && {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        cpuPercent: elapsedMs > 0 ? (cpu.user + cpu.system) / 10 / elapsedMs : 0,
        // How late this tick fired: the event loop was busy for that long.
        eventLoopLagMs: Math.max(0, elapsedMs - interval),
        uptimeSeconds: Math.round(process.uptime()),
        readiness: latest.readiness,
        transports: latest.transports,
        ...(droppedInAll > 0 && { dropped: droppedInAll }),
        servers,
      }
    );
  };

  const onCommand = (message: unknown): void => {
    if (!isDevtoolsHostMessage(message) || message.type !== 'command') {
      return;
    }

    const { id, serverId: target } = message.payload as { id: string; serverId?: unknown };

    if (target === undefined) {
      answer(message.payload);

      return;
    }

    if (typeof target !== 'string') {
      send(
        agentMessage(
          'commandResult',
          failed(id, `A command's "serverId" must be a string, got ${target === null ? 'null' : typeof target}`),
        ),
      );

      return;
    }

    const speaker = hostSpeakers().find((candidate) => candidate.serverId === target);

    if (speaker) {
      speaker.answer(message.payload);
    } else {
      send(
        agentMessage(
          'commandResult',
          failed(id, `No attached server has the id ${JSON.stringify(target)}; the command was not run`),
        ),
      );
    }
  };

  let removeListener: (() => void) | undefined;
  let sampler: Timer | undefined;
  const releaseHost = claimHost({
    serverId,
    state,
    answer,
    listen: () => {
      removeListener ??= channel.onMessage(onCommand);

      if (sampler) {
        return;
      }

      lastCpu = process.cpuUsage();
      lastAt = performance.now();
      sampler = setInterval(() => {
        const metrics = sample();

        if (metrics) {
          sendTelemetry(agentMessage('metrics', metrics));
        }
      }, interval);
      sampler.unref();
    },
    unlisten: () => {
      removeListener?.();
      removeListener = undefined;
      clearInterval(sampler);
      sampler = undefined;
    },
  });
  let detached = false;

  return {
    detach: () => {
      if (detached) {
        return;
      }

      detached = true;
      unsubscribe();
      releaseOutput();
      releaseHost();
      send(agentMessage('serverStopped', { serverId }));
    },
  };
};
