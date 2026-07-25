---
'@asenajs/asena': minor
---

### Microservice messaging

Asena services can now talk to each other over a message broker, supporting both **orchestration** (request/response) and **choreography** (fire-and-forget events). The core ships the broker-agnostic SPI and an in-process reference transport; real brokers live in separate packages ([`@asenajs/asena-redis`](https://www.npmjs.com/package/@asenajs/asena-redis) Redis Streams, [`@asenajs/asena-kafka`](https://www.npmjs.com/package/@asenajs/asena-kafka) Kafka).

- **`@MessageController(prefix?)`** — a new component type holding message handlers. Accepts a prefix string or `{ prefix, transport, name }`.
- **`@MessagePattern(pattern)`** — request/response handler; the method's return value is sent back as the reply. Wildcards are rejected at decoration time (exact routing is required).
- **`@EventPattern(pattern)`** — fire-and-forget handler; wildcards supported (`payment.*`, `*.completed`, `user.*.created`).
- Both accept `{ pattern, prefix?, skip? }`, and every handler receives `(data, context: MessageContext)` with `pattern`, `messageId`, `correlationId`, `headers`, `timestamp` and `attempt`.

**Client API on `Ulak`:**

- `ulak.send(pattern, data, options?)` — request/response, awaits the remote reply, honors a timeout.
- `ulak.emit(pattern, data, options?)` — fire-and-forget event.
- `ulak.messages(prefix?, { transport? })` and the `ulak.messages('order')` injection helper — a pattern-scoped view so callers don't repeat the prefix: `orders.send('create', dto)` → `order.create`.
- New `UlakErrorCode` members: `NO_TRANSPORT`, `TRANSPORT_NOT_FOUND`, `TIMEOUT`, `REMOTE_ERROR`.

**Transport SPI** (`@asenajs/asena/microservice`, a new export subpath):

- `MicroserviceTransport` — implement `init`, `registerMessageHandler`, `registerEventHandler`, `listen`, `send`, `emit`, `destroy` to plug in any broker.
- `InMemoryTransport` — zero-dependency in-process transport for development and tests.
- `MessagingInterceptor` (`onSend` / `onReceive`) — wrapper hooks around outgoing and incoming messages, registered via `transport() { return { microservice, interceptors: [...] } }`. This is how [`@asenajs/asena-otel`](https://www.npmjs.com/package/@asenajs/asena-otel) propagates trace context.
- **Multiple named transports** — `transport()` accepts a record, and `@MessageController({ transport: 'kafka' })` binds a controller to one of them, so a single service can bridge two brokers. A single unnamed transport registers as `default`.

Transports are connected and start consuming before the HTTP adapter binds, so handlers are live the moment the service is reachable. Controllers found with no transport configured fail the boot with a clear message, and a transport with zero handlers starts no consumer loop (client-only mode).

### Headless mode

An Asena service no longer needs an HTTP server. `AsenaServerFactory.create({ headless: true })` boots the container, IoC, message controllers, the event system and schedules without an adapter — for workers driven purely by messages. Omitting the adapter *without* `headless: true` still fails, so the intent must be explicit. Adapter-only features (`globalMiddlewares`, `onError`, WebSocket transport) log a warning and are skipped instead of crashing.

### Health endpoint

`AsenaServerFactory.create({ health: { port, path? } })` starts a small standalone health server (default path `/healthz`), mainly for headless deployments and Kubernetes probes. It reports each named transport separately and returns `503` while any configured transport is disconnected.

### Also

- **`PatternHandlerIndex`** (`@asenajs/asena/event`) — the shared exact-map + wildcard-array lookup used by the event system and every transport, now a reusable export.
- `AsenaAdapter.start()` accepts an optional `AsenaStartOptions`. The parameter is optional, so existing adapters keep compiling and may ignore it.
