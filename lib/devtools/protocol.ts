// The IPC contract between the devtools agent (in the app) and the console host (in the CLI).
// Self-contained on purpose: the CLI has no core dependency and carries a copy of this file.
// Every export is @internal: the console's wire format, versioned by DEVTOOLS_PROTOCOL_VERSION, not by semver.

/** @internal */
export const DEVTOOLS_PROTOCOL_VERSION = 1;

/** @internal */
export type DevtoolsComponentType =
  | 'COMPONENT'
  | 'SERVICE'
  | 'CONTROLLER'
  | 'FRONTEND_CONTROLLER'
  | 'SCHEDULE'
  | 'MIDDLEWARE'
  | 'WEBSOCKET'
  | 'CONFIG'
  | 'EVENT'
  | 'POST_PROCESSOR'
  | 'MESSAGE_CONTROLLER'
  | 'EXCEPTION_HANDLER';

/** @internal */
export type DevtoolsScope = 'singleton' | 'prototype';

/** @internal */
export type DevtoolsLifecycleState = 'NEW' | 'STARTING' | 'STARTED' | 'STOPPING' | 'STOPPED' | 'FAILED';

/** @internal */
export type DevtoolsHttpMethod =
  'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE' | 'ALL';

/** @internal */
export interface DevtoolsDependency {
  /** `null` for a soft dependency: a controller's middleware, which no field holds. */
  field: string | null;
  /** The container key resolved, e.g. a component name or an `@Implements` interface name. */
  target: string;
  kind: 'inject' | 'soft' | 'strategy';
}

/**
 * An `@Value` field. Never carries the value itself.
 * @internal
 */
export interface DevtoolsValueField {
  field: string;
  /** The environment variable name. */
  key: string;
  hasDefault: boolean;
  /** Whether a `parse` function converts the raw string. */
  parsed: boolean;
  /** Whether the environment variable is set in the app process. */
  isSet: boolean;
}

/** @internal */
export interface DevtoolsComponent {
  /** The container key (`@Service('name')` or the class name). */
  name: string;
  type: DevtoolsComponentType;
  scope: DevtoolsScope;
  /** `@Implements` keys the component is also reachable under. */
  interfaces: string[];
  className: string;
  dependencies: DevtoolsDependency[];
  values: DevtoolsValueField[];
}

/** @internal */
export interface DevtoolsRoute {
  /** Controller component name. */
  controller: string;
  /** Handler method name. */
  method: string;
  httpMethod: DevtoolsHttpMethod;
  /** Full path as registered with the adapter, controller prefix included. */
  path: string;
  /** Controller-level then route-level middleware names, in the order they run. */
  middlewares: string[];
  /** Validator component name (`validator:` option), or `null`. */
  validator: string | null;
  /** Context class name when the route validates through `Context.define`, or `null`. */
  contract: string | null;
  /** Whether a JSON or form body is validated, by the validator or by the contract. */
  hasBodySchema: boolean;
  /** Whether the route serves files through a `staticServe` class. */
  staticServe?: boolean;
}

/**
 * A `@Page` of a `@FrontendController`, served by Bun outside the middleware chain.
 * @internal
 */
export interface DevtoolsPage {
  controller: string;
  method: string;
  path: string;
}

/** @internal */
export interface DevtoolsWebSocket {
  /** The `@WebSocket` path, without a leading slash, as the namespace is registered. */
  namespace: string;
  component: string;
}

/** @internal */
export interface DevtoolsSchedule {
  name: string;
  cron: string;
}

/** @internal */
export interface DevtoolsEventHandler {
  component: string;
  method: string;
  /** Final pattern, the `@EventService` prefix applied. */
  event: string;
}

/** @internal */
export interface DevtoolsMessageHandler {
  controller: string;
  method: string;
  /** Final pattern, the `@MessageController` prefix applied. */
  pattern: string;
  kind: 'message' | 'event';
  transport: string;
}

/** @internal */
export interface DevtoolsCaughtType {
  name: string;
  /** Constructor names from this type upward, itself first, `Object` and `Function` left out. */
  chain: string[];
  /** Present when the type carries the `HttpException` brand, which the registry matches across class trees. */
  httpException?: true;
}

/** @internal */
export interface DevtoolsCatch {
  method: string;
  /** The `@Catch` types, or `'catch-all'` for a bare `@Catch()`. */
  types: DevtoolsCaughtType[] | 'catch-all';
}

/** @internal */
export interface DevtoolsExceptionHandler {
  component: string;
  catches: DevtoolsCatch[];
  /** The `@NotFound()` method, when this class declares it. */
  notFound?: string;
}

/** @internal */
export interface DevtoolsGlobalMiddleware {
  middleware: string;
  include?: string[];
  exclude?: string[];
}

/** @internal */
export interface DevtoolsConfig {
  /** The `@Config` component name, absent when the app declares none. */
  component?: string;
  hasOnError: boolean;
  hasOnNotFound: boolean;
  /** In declaration order, which is the order they run. */
  globalMiddlewares: DevtoolsGlobalMiddleware[];
}

/** @internal */
export interface DevtoolsSnapshot {
  components: DevtoolsComponent[];
  routes: DevtoolsRoute[];
  pages?: DevtoolsPage[];
  websockets: DevtoolsWebSocket[];
  schedules: DevtoolsSchedule[];
  events: DevtoolsEventHandler[];
  messageHandlers: DevtoolsMessageHandler[];
  exceptionHandlers: DevtoolsExceptionHandler[];
  config: DevtoolsConfig;
}

/**
 * A microservice transport from `@Config.transport()`, under the name `Ulak` registers it by.
 * @internal
 */
export interface DevtoolsTransport {
  name: string;
  connected: boolean;
}

/**
 * Names one `AsenaServer` of the app process. The id is opaque, unique among the servers of that
 * process and fixed for the server's life; a restarted process may hand out the same ids again.
 * @internal
 */
export interface DevtoolsServerRef {
  serverId: string;
}

/** @internal */
export interface DevtoolsHello extends DevtoolsServerRef {
  coreVersion: string;
  /** Adapter name, `null` in headless mode. */
  adapter: string | null;
  /** Bound HTTP port, `null` in headless mode. */
  port: number | null;
  pid: number;
  transports?: DevtoolsTransport[];
}

/**
 * Exactly the readiness body `HealthServer` answers, minus `uptime` (carried by the metrics).
 * @internal
 */
export type DevtoolsReadiness =
  | { status: 'not_ready'; state: DevtoolsLifecycleState }
  | { status: 'up' }
  | { status: 'up' | 'degraded'; transports: Record<string, 'connected' | 'disconnected'> };

/**
 * The part of a metrics sample that belongs to one server.
 * @internal
 */
export interface DevtoolsServerState {
  readiness: DevtoolsReadiness;
  transports?: DevtoolsTransport[];
  /**
   * This server's request records, and the metrics samples it was the one to send, dropped since it
   * attached because the host was not reading; absent when none.
   */
  dropped?: number;
}

/**
 * One sample per process and tick: the process numbers once, then every attached server's state.
 * @internal
 */
export interface DevtoolsMetrics {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  cpuPercent: number;
  eventLoopLagMs: number;
  uptimeSeconds: number;
  /** Of the most recently attached server in `servers`. */
  readiness: DevtoolsReadiness;
  /** Of the most recently attached server in `servers`. */
  transports?: DevtoolsTransport[];
  /** The `dropped` counts of the attached servers, added up; absent when none. */
  dropped?: number;
  /**
   * Every attached server by `serverId`. A server whose state could not be read on this tick is
   * left out of the sample; one that stopped is announced by `serverStopped`.
   */
  servers: Record<string, DevtoolsServerState>;
}

/** @internal */
export type DevtoolsStepKind =
  | 'global-middleware'
  | 'middleware'
  | 'validator'
  | 'controller'
  | 'catch'
  | 'config-onError'
  | 'adapter-default'
  | 'not-found';

/** @internal */
export interface DevtoolsRequestStep {
  kind: DevtoolsStepKind;
  /** Component and method, e.g. `UserController.find`; the adapter name for `adapter-default`. */
  name: string;
}

/** @internal */
export interface DevtoolsRequestLog {
  stream: 'stdout' | 'stderr';
  /** One write, verbatim; may span several lines (a stack trace stays one entry). */
  text: string;
  /** Epoch milliseconds. */
  at: number;
}

/** @internal */
export interface DevtoolsRequestRecord {
  id: string;
  /** Epoch milliseconds, so the host can attach the log lines written during the request. */
  startedAt: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  steps: DevtoolsRequestStep[];
  /** The step that produced the response. */
  answeredBy: DevtoolsRequestStep;
  /** What the app wrote while this request was in scope, in order; capped. */
  logs?: DevtoolsRequestLog[];
  /** Set when the cap dropped lines. */
  logsTruncated?: true;
}

/** @internal */
export type DevtoolsCommand =
  | { command: 'runSchedule'; name: string }
  | { command: 'emitEvent'; event: string; data?: unknown }
  | { command: 'sendMessage'; transport: string; pattern: string; kind: 'message' | 'event'; data?: unknown };

/**
 * `id` correlates the command with its `commandResult`. With `serverId` the command runs on that
 * server, and is refused when no attached server has the id; without it, on the most recently
 * attached one.
 * @internal
 */
export type DevtoolsCommandRequest = { id: string; serverId?: string } & DevtoolsCommand;

/**
 * `serverId` is the server that answered; absent when the command named a server that is not attached.
 * @internal
 */
export type DevtoolsCommandResult = { id: string; serverId?: string } & (
  { ok: true; result?: unknown } | { ok: false; error: { name: string; message: string } }
);

/** @internal */
export interface DevtoolsAgentPayloads {
  /** One per server, when it attaches. */
  hello: DevtoolsHello;
  /** One per server, right after its `hello`. */
  snapshot: DevtoolsSnapshot & DevtoolsServerRef;
  metrics: DevtoolsMetrics;
  /** Sent once, with the server whose handler, job or adapter produced the record. */
  request: DevtoolsRequestRecord & DevtoolsServerRef;
  commandResult: DevtoolsCommandResult;
  /** The server detached from the console: it sends nothing more and takes no commands. */
  serverStopped: DevtoolsServerRef;
}

/** @internal */
export interface DevtoolsHostPayloads {
  command: DevtoolsCommandRequest;
}

/** @internal */
export type DevtoolsAgentMessageType = keyof DevtoolsAgentPayloads;

/** @internal */
export type DevtoolsHostMessageType = keyof DevtoolsHostPayloads;

/** @internal */
export interface DevtoolsMessage<T extends string, P> {
  v: typeof DEVTOOLS_PROTOCOL_VERSION;
  type: T;
  payload: P;
}

/** @internal */
export type DevtoolsAgentMessage = {
  [T in DevtoolsAgentMessageType]: DevtoolsMessage<T, DevtoolsAgentPayloads[T]>;
}[DevtoolsAgentMessageType];

/** @internal */
export type DevtoolsHostMessage = {
  [T in DevtoolsHostMessageType]: DevtoolsMessage<T, DevtoolsHostPayloads[T]>;
}[DevtoolsHostMessageType];

const AGENT_MESSAGE_TYPES: readonly string[] = [
  'hello',
  'snapshot',
  'metrics',
  'request',
  'commandResult',
  'serverStopped',
] satisfies DevtoolsAgentMessageType[];

const HOST_MESSAGE_TYPES: readonly string[] = ['command'] satisfies DevtoolsHostMessageType[];

/** @internal */
export const agentMessage = <T extends DevtoolsAgentMessageType>(
  type: T,
  payload: DevtoolsAgentPayloads[T],
): DevtoolsMessage<T, DevtoolsAgentPayloads[T]> => ({ v: DEVTOOLS_PROTOCOL_VERSION, type, payload });

/** @internal */
export const hostMessage = <T extends DevtoolsHostMessageType>(
  type: T,
  payload: DevtoolsHostPayloads[T],
): DevtoolsMessage<T, DevtoolsHostPayloads[T]> => ({ v: DEVTOOLS_PROTOCOL_VERSION, type, payload });

const isEnvelope = (value: unknown, types: readonly string[]): boolean => {
  if (typeof value !== 'object' || value === null) return false;

  const { v, type, payload } = value as Record<string, unknown>;

  return (
    v === DEVTOOLS_PROTOCOL_VERSION &&
    typeof type === 'string' &&
    types.includes(type) &&
    typeof payload === 'object' &&
    payload !== null
  );
};

/**
 * Envelope check: an object payload is trusted to match its type once the version agrees.
 * @internal
 */
export const isDevtoolsAgentMessage = (value: unknown): value is DevtoolsAgentMessage =>
  isEnvelope(value, AGENT_MESSAGE_TYPES);

/**
 * Envelope check, plus the string `id` the agent answers under; `serverId` and the command's own fields are the agent's to check.
 * @internal
 */
export const isDevtoolsHostMessage = (value: unknown): value is DevtoolsHostMessage =>
  isEnvelope(value, HOST_MESSAGE_TYPES) && typeof (value as { payload: { id?: unknown } }).payload.id === 'string';
