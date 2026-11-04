// The IPC contract between the devtools agent (in the app) and the console host (in the CLI).
// Self-contained on purpose: the CLI has no core dependency and carries a copy of this file.

export const DEVTOOLS_PROTOCOL_VERSION = 1;

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

export type DevtoolsScope = 'singleton' | 'prototype';

export type DevtoolsLifecycleState = 'NEW' | 'STARTING' | 'STARTED' | 'STOPPING' | 'STOPPED' | 'FAILED';

export type DevtoolsHttpMethod =
  'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE' | 'ALL';

export interface DevtoolsDependency {
  /** `null` for a soft dependency: a controller's middleware, which no field holds. */
  field: string | null;
  /** The container key resolved, e.g. a component name or an `@Implements` interface name. */
  target: string;
  kind: 'inject' | 'soft' | 'strategy';
}

/** An `@Value` field. Never carries the value itself. */
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
}

export interface DevtoolsWebSocket {
  /** The `@WebSocket` path, without a leading slash, as the namespace is registered. */
  namespace: string;
  component: string;
}

export interface DevtoolsSchedule {
  name: string;
  cron: string;
}

export interface DevtoolsEventHandler {
  component: string;
  method: string;
  /** Final pattern, the `@EventService` prefix applied. */
  event: string;
}

export interface DevtoolsMessageHandler {
  controller: string;
  method: string;
  /** Final pattern, the `@MessageController` prefix applied. */
  pattern: string;
  kind: 'message' | 'event';
  transport: string;
}

export interface DevtoolsCaughtType {
  name: string;
  /** Constructor names from this type upward, itself first, `Object` and `Function` left out. */
  chain: string[];
  /** Present when the type carries the `HttpException` brand, which the registry matches across class trees. */
  httpException?: true;
}

export interface DevtoolsCatch {
  method: string;
  /** The `@Catch` types, or `'catch-all'` for a bare `@Catch()`. */
  types: DevtoolsCaughtType[] | 'catch-all';
}

export interface DevtoolsExceptionHandler {
  component: string;
  catches: DevtoolsCatch[];
  /** The `@NotFound()` method, when this class declares it. */
  notFound?: string;
}

export interface DevtoolsGlobalMiddleware {
  middleware: string;
  include?: string[];
  exclude?: string[];
}

export interface DevtoolsConfig {
  /** The `@Config` component name, absent when the app declares none. */
  component?: string;
  hasOnError: boolean;
  hasOnNotFound: boolean;
  /** In declaration order, which is the order they run. */
  globalMiddlewares: DevtoolsGlobalMiddleware[];
}

export interface DevtoolsSnapshot {
  components: DevtoolsComponent[];
  routes: DevtoolsRoute[];
  websockets: DevtoolsWebSocket[];
  schedules: DevtoolsSchedule[];
  events: DevtoolsEventHandler[];
  messageHandlers: DevtoolsMessageHandler[];
  exceptionHandlers: DevtoolsExceptionHandler[];
  config: DevtoolsConfig;
}

export interface DevtoolsHello {
  coreVersion: string;
  /** Adapter name, `null` in headless mode. */
  adapter: string | null;
  /** Bound HTTP port, `null` in headless mode. */
  port: number | null;
  pid: number;
}

/** Exactly the readiness body `HealthServer` answers, minus `uptime` (carried by the metrics). */
export type DevtoolsReadiness =
  | { status: 'not_ready'; state: DevtoolsLifecycleState }
  | { status: 'up' }
  | { status: 'up' | 'degraded'; transports: Record<string, 'connected' | 'disconnected'> };

export interface DevtoolsMetrics {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  cpuPercent: number;
  eventLoopLagMs: number;
  uptimeSeconds: number;
  readiness: DevtoolsReadiness;
}

export type DevtoolsStepKind =
  | 'global-middleware'
  | 'middleware'
  | 'validator'
  | 'controller'
  | 'catch'
  | 'config-onError'
  | 'adapter-default'
  | 'not-found';

export interface DevtoolsRequestStep {
  kind: DevtoolsStepKind;
  /** Component and method, e.g. `UserController.find`; the adapter name for `adapter-default`. */
  name: string;
}

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
}

export type DevtoolsCommand =
  | { command: 'runSchedule'; name: string }
  | { command: 'emitEvent'; event: string; data?: unknown }
  | { command: 'sendMessage'; transport: string; pattern: string; kind: 'message' | 'event'; data?: unknown };

/** `id` correlates the command with its `commandResult`. */
export type DevtoolsCommandRequest = { id: string } & DevtoolsCommand;

export type DevtoolsCommandResult =
  { id: string; ok: true; result?: unknown } | { id: string; ok: false; error: { name: string; message: string } };

export interface DevtoolsAgentPayloads {
  hello: DevtoolsHello;
  snapshot: DevtoolsSnapshot;
  metrics: DevtoolsMetrics;
  request: DevtoolsRequestRecord;
  commandResult: DevtoolsCommandResult;
}

export interface DevtoolsHostPayloads {
  command: DevtoolsCommandRequest;
}

export type DevtoolsAgentMessageType = keyof DevtoolsAgentPayloads;

export type DevtoolsHostMessageType = keyof DevtoolsHostPayloads;

export interface DevtoolsMessage<T extends string, P> {
  v: typeof DEVTOOLS_PROTOCOL_VERSION;
  type: T;
  payload: P;
}

export type DevtoolsAgentMessage = {
  [T in DevtoolsAgentMessageType]: DevtoolsMessage<T, DevtoolsAgentPayloads[T]>;
}[DevtoolsAgentMessageType];

export type DevtoolsHostMessage = {
  [T in DevtoolsHostMessageType]: DevtoolsMessage<T, DevtoolsHostPayloads[T]>;
}[DevtoolsHostMessageType];

const AGENT_MESSAGE_TYPES: readonly string[] = [
  'hello',
  'snapshot',
  'metrics',
  'request',
  'commandResult',
] satisfies DevtoolsAgentMessageType[];

const HOST_MESSAGE_TYPES: readonly string[] = ['command'] satisfies DevtoolsHostMessageType[];

export const agentMessage = <T extends DevtoolsAgentMessageType>(
  type: T,
  payload: DevtoolsAgentPayloads[T],
): DevtoolsMessage<T, DevtoolsAgentPayloads[T]> => ({ v: DEVTOOLS_PROTOCOL_VERSION, type, payload });

export const hostMessage = <T extends DevtoolsHostMessageType>(
  type: T,
  payload: DevtoolsHostPayloads[T],
): DevtoolsMessage<T, DevtoolsHostPayloads[T]> => ({ v: DEVTOOLS_PROTOCOL_VERSION, type, payload });

const isEnvelope = (value: unknown, types: readonly string[]): boolean => {
  if (typeof value !== 'object' || value === null) return false;

  const { v, type, payload } = value as Record<string, unknown>;

  return v === DEVTOOLS_PROTOCOL_VERSION && typeof type === 'string' && types.includes(type) && payload !== undefined;
};

/** Envelope check only: the payload is trusted to match its type once the version agrees. */
export const isDevtoolsAgentMessage = (value: unknown): value is DevtoolsAgentMessage =>
  isEnvelope(value, AGENT_MESSAGE_TYPES);

export const isDevtoolsHostMessage = (value: unknown): value is DevtoolsHostMessage =>
  isEnvelope(value, HOST_MESSAGE_TYPES);
