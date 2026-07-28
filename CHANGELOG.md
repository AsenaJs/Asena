# @asenajs/asena

## 0.9.1

### Patch Changes

- `@Strategy` now behaves the same at every cardinality

  `@Strategy` is multi-valued by construction — that is the whole difference from `@Inject`. It was
  correct at exactly one cardinality:

  | implementations       | before                                                   | now                      |
  | --------------------- | -------------------------------------------------------- | ------------------------ |
  | 0                     | boot aborted with `<key> is not registered`              | injected as `[]`         |
  | 1                     | field held a **bare instance**, not `[instance]`         | injected as `[instance]` |
  | 1, with an expression | reading the field threw `strategy.map is not a function` | expression applied       |
  | 2+                    | correct                                                  | unchanged                |

  One root cause. `Container.register()` stores a key's first registration as a bare
  `ContainerService` and only converts to an array on the second, so `_services[key]` has three
  shapes — absent, object, array — which `resolve()` maps to throw / `T` / `T[]`. That is right for
  `@Inject`, whose dependency is single-valued: it is either there or the component is broken.
  `resolveStrategy` was a cast over that same lookup, so it declared `T[]` for all three.

  The single-implementation case was the more dangerous half. Zero died loudly at boot; one passed
  boot and failed later at the first `.length`, `for...of` or `.map()`, far from the cause. And
  because the bug disappears as implementations are added — write the registry (boot dies), add the
  first plugin (silently wrong), add the second (suddenly works) — it tends to get "fixed" by
  accident and never diagnosed.

  A strategy key with no implementations is a plugin point before its first plugin, which is the
  ordinary starting condition of one, not a misconfiguration. This also fixes mocking a strategy key
  through `createTestApp`'s `overrides`, which produced the same single-implementation shape.

  **API note:** `Container.resolveStrategy` is now `Promise<T[]>` instead of `Promise<T[] | null>`.
  The `null` half was never reachable — `resolve()` threw instead — so this narrows the type to what
  the method actually did.

  **New diagnostic:** because an empty key is now silently `[]`, a typo'd interface name no longer
  fails at boot; it surfaces later as a collection that is always empty. `IocEngine` therefore logs
  `Strategy key '<key>' has no implementations - <Component>.<field> will be injected as []` once per
  injection site at boot, at `debug` level, so a deliberate plugin point stays quiet. Keys supplied
  through `overrides` are not reported.

## 0.9.0

### Minor Changes

- Decorators declared on a base class are now inherited by the decorated subclass

  Method-level decorators write their metadata to the class where the method is _declared_, but
  the readers did not walk the prototype chain. `@Get`/`@Post`/… and `@Page` were read with
  `getOwnMetadata`, so routes and pages on a base class were never registered — the route simply
  did not exist, with no error and no log line. `@On`, `@MessagePattern` and `@EventPattern` were
  read with `getMetadata`, which returns the nearest ancestor's record whole, so a single handler
  declared on the subclass silently discarded every handler it inherited.

  The rule is now the one Spring (`MethodIntrospector.selectMethods` scans the hierarchy) and
  JAX-RS §3.6 use, and it has two halves:

  > **What changes the behaviour of a request travels with the route. What says where the route
  > lives, or what a class is, belongs to the concrete class.**

  **Inherited:** `@Get`/`@Post`/`@Put`/`@Delete`/`@Patch`/`@Options`/`@Head`/`@All`, `@Page`,
  `@On`, `@MessagePattern`, `@EventPattern`, `@Override`, and a controller's class-level
  `middlewares`. A subclass overrides an inherited handler **by method name** and keeps the rest.

  **Not inherited:** `@Controller`/`@WebSocket`/`@FrontendController` paths, component names,
  scopes, event and message prefixes, and the component-type markers.

  The same merge is applied to `extractControllerRouteInfo` — which `@asenajs/asena-openapi` uses
  to build its schema — and to the `createWebTest` slice harness, so the schema, the tests and the
  running server all report the same route set.

  ## Breaking changes
  1. **Routes, pages and handlers on a base class now register.** Decorated methods that were
     previously dead become live endpoints and subscriptions. An inherited `@EventPattern` opens a
     real subscription on the configured transport. Each component logs what it inherited at
     startup.
  2. **Two methods resolving to the same path now throw** `Duplicate route detected` (the
     equivalent of Spring's `Ambiguous mapping`) instead of one silently winning. The message names
     both methods, because with inheritance the other one is usually in a file you are not looking
     at. Rename the subclass method to match the inherited one to turn the conflict back into an
     override. The same applies to two controllers extending one route-carrying base and sharing a
     `@Controller` prefix.
  3. **A subclass inherits its base's controller-level `middlewares`.** `@Controller` writes that
     key unconditionally — an empty array when none are declared — so reading it own-only let a
     subclass shadow its base's guards while still inheriting the base's routes: the route
     registered, the guard did not. A subclass may add middlewares; it can no longer silently drop
     an inherited one. To publish routes without a base's guards, move them to an _undecorated_
     base class.
  4. **An undecorated subclass of a component is no longer registered**, and the engine now
     **warns**, naming both classes. Component identity is read own-only. Previously such a class
     was registered under its _base's_ name, the container promoted the entry to an array, and
     every `@Inject(Base)` handed out `[Base, Sub]` — failing on first property access, far from
     the cause. Silently skipping it would have been worse: with `@Schedule` the cron would simply
     never fire. The same check now also applies to components passed explicitly to
     `AsenaServerFactory.create({ components: [...] })`, which used to bypass validation entirely.
  5. **`NotFoundError`, `NOT_FOUND_ERROR` and `isNotFoundError` are removed.** An unmatched route
     is no longer modelled as an error; see `onNotFound` below.
  6. **Eight unused `ComponentConstants` keys are removed** (`TypeKey`, `ControllerConfigKey`,
     `MethodKey`, `RoutePathKey`, `RouteMiddlewaresKey`, `RouteValidatorKey`, `WebSocketPathKey`,
     `WebSocketMiddlewaresKey`). None had a writer or a reader anywhere in the framework.
  7. **Two components can no longer share a name.** It is now a startup error naming both classes,
     where it was a warning on the scan path and nothing at all on the explicit
     `components: [...]` path. The resolution was silent and arbitrary: both classes survived
     deduplication, `initializeGraph` then keyed them by name in a `Map`, and whichever came last
     in scan order overwrote the other. Only the winner was registered — so a route naming the
     loser ran the winner's handler, and `@Inject(Loser)` returned an instance of the winner:

     ```typescript
     const makeGuard = (token: string) => {
       @Middleware()
       class FactoryGuard extends AsenaMiddlewareService {
         /* … */
       }
       return FactoryGuard;
     };
     const ReadGuard = makeGuard('read'); // both classes are named 'FactoryGuard',
     const AdminGuard = makeGuard('admin'); // and nothing in the source looks duplicated
     ```

     A component name is an identity, so two classes claiming one is a conflict rather than a
     preference — the same reasoning as `Duplicate route detected`, one layer down. Give one of
     them an explicit name (`@Service({ name: '…' })`) to resolve it. Listing the same class twice
     is still deduplicated, not rejected.

  8. **A middleware or validator that is not itself a component now fails at startup**, naming the
     class, instead of resolving to its base class. `PrepareMiddlewareService` and
     `PrepareValidatorService` looked the component name up off the prototype chain, so an
     _undecorated_ subclass — no longer registered under the own-only identity rule above —
     resolved to its **ancestor's** name and the ancestor's handler ran in its place:

     ```typescript
     @Middleware() class ReadGuard extends MiddlewareService { /* permissive */ }
     class AdminGuard extends ReadGuard { /* strict */ }        // @Middleware() forgotten

     @Delete({ path: '/:id', middlewares: [AdminGuard] })       // ran ReadGuard, answered 200
     ```

     The route registered, the request was authorized by the **weaker** guard, and nothing was
     logged: the undecorated-subclass warning above only fires for classes the scan sees, and a
     guard used solely from a `middlewares` array is usually not exported. The same applied to
     validators, where the permissive base schema silently replaced the stricter one. Both now
     throw, and `defineMiddleware` records the soft dependency under the class's own name.

     Deleting the decorator used to be caught — 0.8.1 refused to boot with a spurious
     `Circular dependency detected`, because the subclass registered under its base's name and
     `getDependencies` turned that into a self-edge. Fixing that self-edge is what turned a noisy
     boot failure into a silent one, so this is a regression introduced _within_ this release, not
     a pre-existing hazard.

  ## New: `AsenaConfig.onNotFound(context, request)`

  `onError` is for errors your code threw. `onNotFound` is for requests that matched no route — a
  routing outcome, not a failure — so neither handler has to ask which it is looking at:

  ```typescript
  public onNotFound(context: Context, request: NotFoundRequest) {
    return context.send({ title: 'Not Found', status: 404, instance: request.path }, 404);
  }
  ```

  `request.path` and `request.method` are normalised by the adapter, so the same body works on
  either one. With no handler declared, both adapters answer `{"error":"Not Found"}` with a 404.
  `AsenaAdapter.onNotFound` is optional, and the server warns at startup when a config declares
  the hook but the adapter in use cannot honour it.

  ## New: `isHttpException()` and the `HTTP_EXCEPTION` brand

  `ValidationError` was branded from the start; the base class users actually throw was not. With
  two resolved copies of an adapter, `error instanceof HttpException` answers false and every
  deliberate 401/403/404 collapses to a generic 500 — silently, because the API still responds.

  ## Other fixes
  - `@MessagePattern` now throws when two handlers resolve to the same pattern on the same
    transport — request/response has no way to decide which one replies. `@EventPattern` and `@On`
    are exempt, where several handlers on one pattern is fan-out.
  - `IocEngine.getDependencies` no longer reports a circular dependency when a component's parent
    class resolves to the component's own registered name. A decorator that returns a subclass of
    the class it decorates (`@Repository`, `@Database`, `@Redis`, `@Kafka`) made every such
    component depend on itself.
  - `IocEngine.getStrategyDependencies` recursed on `parentClass.constructor`, which for a class is
    always `Function`, so a `@Strategy` field declared on a base class was missing from the
    dependency graph and the component resolved before its implementations were registered.
  - `Container.injectStrategies` guarded on the _existence_ of an own property descriptor while
    `injectDependencies` guards on its _value_. A base class's `@Strategy` won over the subclass's
    override, and under `useDefineForClassFields` (the default at ES2022+) an initializer-less
    field was never injected at all — invisible when running under Bun, which uses Set semantics.
  - `defineMiddleware` read the soft-dependency record off `target.constructor` while writing it to
    `target`, so each call overwrote the previous one and route-level middlewares never made it
    into the dependency graph.
  - `mockFactory` detected methods on the own prototype only, so a service inheriting from a base
    class was mocked without them and slice tests failed inside the harness with
    `… is not a function`.
  - `hasInjectedFields`, `getFieldServiceName` and `getFieldExpression` in the test metadata
    helpers read record-shaped metadata with `getMetadata`, which the `{}` seed written by
    `defineComponent` guaranteed would shadow the base class's record.
  - The headless-mode startup warning read the component-type marker off the chain — the only
    reader in the framework that still did — so a `@Service` extending a `@Controller` was listed
    as an HTTP-only component that "will be ignored", while being registered and working normally.

  **New exports:** `getChainedTypedMetadata`, `getChainedTypedMetadataList`, `getPrototypeChainOf`
  from `@asenajs/asena/utils`; `NotFoundHandler`, `NotFoundRequest`, `HTTP_EXCEPTION`,
  `HttpExceptionLike`, `isHttpException` from `@asenajs/asena/adapter`.

## 0.8.1

### Patch Changes

- 8230e9c: Fix a startup deadlock: the component scan no longer imports the application entry file

  `IocEngine.loadComponents()` imported every file under `sourceFolder`, including the entry
  file itself. While the entry awaits `AsenaServerFactory.create()` at module scope it is in
  the _evaluating-async_ state, so that self-import is a cyclic dynamic import which can only
  settle once the scan returns. Bun 1.3.14 follows the specification here and waits, so every
  application booted from source with the documented top-level-await bootstrap hung after the
  banner - no error, no log, no exit. Earlier Bun versions short-circuited it, which is why
  this went unnoticed since 0.3.0.

  The scan now excludes both the configured `rootFile` and the module actually being executed
  (`Bun.main`). **Declaring components directly in the entry file keeps working**: component
  decorators register their class in a registry as they run, and the scan reads entry-file
  components from there instead of importing the file. Components declared _below_ the
  bootstrap call have not been evaluated in time to be registered, and are now reported by
  name at startup rather than silently missing.

  Also in this release:

  - A component file that fails to import now aborts startup instead of being skipped with a
    `console.error`, which used to leave the server running with components silently absent.
    Import errors and other engine diagnostics go through the framework logger.
  - An import that has not settled after 10s is reported by file name, so a never-resolving
    top-level await in application code is diagnosable instead of an unexplained hang. Tunable
    via `importTimeout` in `asena-config.ts`.
  - `asena-config.ts` is looked up directly in the project root before falling back to a walk,
    and the walk now skips `node_modules` and dotfolders and is ordered. Previously every boot
    stat'ed the entire project - tens of thousands of files - and the first match won in
    undefined directory order, so a dependency shipping a matching filename could be picked up
    instead of the project's own config.
  - An absolute `sourceFolder` no longer breaks the scan: paths were joined onto `process.cwd()`
    unconditionally, so every import failed and the boot ended with a generic
    `No components found`.
  - New `isValidationError()` guard and `ValidationErrorLike` contract in `@asenajs/asena/adapter`,
    used by the adapters to report request validation failures through `ConfigService.onError`.

## 0.8.0

### Minor Changes

- 732f7cf: ### Microservice messaging

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

  An Asena service no longer needs an HTTP server. `AsenaServerFactory.create({ headless: true })` boots the container, IoC, message controllers, the event system and schedules without an adapter — for workers driven purely by messages. Omitting the adapter _without_ `headless: true` still fails, so the intent must be explicit. Adapter-only features (`globalMiddlewares`, `onError`, WebSocket transport) log a warning and are skipped instead of crashing.

  ### Health endpoint

  `AsenaServerFactory.create({ health: { port, path? } })` starts a small standalone health server (default path `/healthz`), mainly for headless deployments and Kubernetes probes. It reports each named transport separately and returns `503` while any configured transport is disconnected.

  ### Also
  - **`PatternHandlerIndex`** (`@asenajs/asena/event`) — the shared exact-map + wildcard-array lookup used by the event system and every transport, now a reusable export.
  - `AsenaAdapter.start()` accepts an optional `AsenaStartOptions`. The parameter is optional, so existing adapters keep compiling and may ignore it.

- 732f7cf: Fix `mockComponent` crash for services with `@Inject(ulak(...))` dependencies and improve expression handling:
  - **Fix:** `mockComponent` no longer throws `TypeError: ulak.namespace is not a function` for expression-based injections (e.g. the `ulak()` helper). Expressions are now evaluated against a deep mock, so injected namespaces work out of the box and their methods are assertable Bun mocks.
  - **Behavior change:** a field present in `overrides` is now used as the FINAL injected value — its `@Inject` expression is skipped instead of being applied on top of the override.
  - **Behavior change:** override presence is checked with `Object.hasOwn`, so falsy override values (`0`, `''`, `null`, `undefined`) are injected as-is instead of being silently ignored.
  - **New:** `createDeepMock()` exported from `@asenajs/asena/test` — Proxy-based deep mock where any property access yields a Bun mock and any call returns a chainable deep mock.
  - **New:** `createTestUlakStub(path)` exported from `@asenajs/asena/test` — fully typed `Ulak.NameSpace` stub with all methods mocked.

- 732f7cf: Add an integration test harness to `@asenajs/asena/test` and fix `mockComponent` auto-mocking:
  - **Fix:** `mockComponent` now generates real method mocks for class-based injections (`@Inject(UserService)`). Previously every non-expression field received an empty object, so the documented "auto-generates mocks for all methods" behavior only worked when you passed `overrides`. String injections (`@Inject('UserService')`) still degrade to `{}` — a string carries no class reference — and continue to need an explicit override.
  - **New:** `createTestApp(options)` — boots a full application (container, all bootstrap phases, real adapter and routing) for testing. Spring's `@SpringBootTest` equivalent. Supports `overrides` to replace any registered service with a double, `await using` cleanup, and an ephemeral `port: 0` binding that removes random-port collisions.
  - **New:** `createWebTest(options)` — boots only the web layer. Controllers, their middlewares and their validators are real; every other injected dependency is auto-mocked from its class shape. Spring's `@WebMvcTest` equivalent. `mocks` is keyed by service name, with one shared double per service.
  - **New:** `TestHttpCall` / `TestHttpResponse` — supertest-style fluent assertions (`expectStatus`, `expectHeader`, `expectJson`, `expectJsonContains`, `expectBody`, `expect`). Requests are lazy and memoized; the response body is buffered once so it can be read repeatedly.
  - **New:** `silentLogger` and `createCapturingLogger()` — a no-op `ServerLogger` and a recording variant for asserting on warnings.
  - **New:** `dispatch: 'socket'` — runs the adapter's real routing pipeline over a unix domain socket instead of a TCP port, so parallel suites cannot collide. Use `app.wsUrl(path)` to build WebSocket URLs that work in both dispatch modes.
  - **New:** `Container.overrideInstance(key, instance)` and `Container.isOverridden(key)`. Overrides are seeded before user components register, so the real class is never constructed (no `@PostConstruct` side effects) and dependents capture the double. `AsenaServerFactory.create({ overrides })` exposes this; overriding a core service throws.
  - **New:** `AsenaServer.httpServer` getter exposes the Bun server the adapter bound, which is the only way to read the actual port when starting on port 0.
  - **New:** `discoverInjectedFieldsFromClass(Class)` exported from `@asenajs/asena/test`, plus `FieldMetadata.serviceClass`.
  - **Fix:** `AsenaServerFactory.create({ port: 0 })` is no longer silently ignored (`if (port)` treated 0 as absent).
  - `AsenaAdapter.start()` now accepts an optional `AsenaStartOptions` argument. The parameter is optional, so existing adapters keep compiling and may ignore it.

- 732f7cf: ### Breaking Changes
  - **The `@MessageController` prefix is now applied to `@EventPattern` too.** Previously it was joined onto `@MessagePattern` patterns only and event patterns were always absolute. The prefix is now joined onto **every** handler in the controller, and a handler opts out with `prefix: false`.

    ```typescript
    // Before (0.7)
    @MessageController('order')
    class OrderHandler {
      @MessagePattern('create')          // -> 'order.create'
      @EventPattern('payment.completed') // -> 'payment.completed'
    }

    // After (0.8)
    @MessageController('order')
    class OrderHandler {
      @MessagePattern('create')          // -> 'order.create'   (unchanged)
      @EventPattern('created')           // -> 'order.created'  (prefix now applied)
      @EventPattern({ pattern: 'payment.completed', prefix: false }) // -> 'payment.completed'
    }
    ```

    **Why:** the outbound client side already prefixed events. `ulak.messages('order').emit('created')` publishes `order.created`, but `@MessageController('order') @EventPattern('created')` subscribed to bare `created` — sender and listener disagreed, and the message was silently lost. One rule now governs both directions, and it matches the in-process `@EventService`/`@On` system.

    **Migration:** every `@EventPattern` on a **prefixed** controller must be either rewritten relative to the prefix or given `prefix: false`. Controllers without a prefix are unaffected. Asena logs the resolved patterns for each controller at boot so the result is visible immediately:

    ```
    [Microservice] OrderHandler → "default" (prefix "order") msg: order.create | evt: order.created
    ```

  - **`@EventPattern('*')` under a prefix is no longer a global catch-all** — it resolves to `order.*`, which matches `order.created` and `order.item.added` but not `payment.completed` or the bare `order`. Audit and logging listeners that must see every event need `prefix: false`.
  - **A wildcard `@MessageController` prefix is now a boot error.** `@MessageController('order.*')` previously only failed if the controller had a `@MessagePattern` (the transport vetoed the joined result); on the event side it would now silently produce subscriptions like `order.*.created`. It is rejected at boot with the controller name and the `prefix: false` escape hatch in the message.
  - **Kafka external topics:** a handler for a foreign topic on a prefixed controller now registers under the joined name and **stops consuming**, while the service still boots green and reports healthy. Add `prefix: false` to those `@EventPattern`s. `@asenajs/asena-kafka` prints a hint at `listen()` naming the shadowed handler.

  ### New
  - **`prefix: false` on `@MessagePattern` and `@EventPattern`** — registers the pattern verbatim, ignoring the controller prefix. `prefix: false` does not relax the `@MessagePattern` wildcard ban; request/response still requires exact routing.
  - **`prefix: false` on `@On`** — the in-process event system gains the same opt-out. Previously an `@EventService('user')` class could not listen to an absolute pattern at all without a second, prefix-less service. Purely additive; the default stays `true`.
  - **`PatternHandlerIndex.patterns()`** (`@asenajs/asena/event`) — lists registered patterns, exact first then wildcard. Diagnostics only; used by transports to explain why an expected source matched no handler.
  - Message and event pattern validation errors in `InMemoryTransport` now mention the `prefix: false` escape hatch.

## 0.7.1

### Patch Changes

- ### Features
  - **Context**: Added `routePattern` property to `AsenaContext` interface. Provides the matched route pattern (e.g., `/users/:id`) instead of the raw URL, enabling low-cardinality identifiers for OpenTelemetry and middleware.

  ### Improvements
  - **FrontendController Registration**: `registerHTMLRoute()` now accepts `controllerName` and `controllerBasePath` parameters, allowing adapters to properly log and track FrontendController routes.
  - **Internal**: Switched to barrel export for CronRunner import in PrepareScheduleService.

## 0.7.0

### Minor Changes

- e94d59f: ### New Features
  - **Frontend Controller**: `@FrontendController` and `@Page` decorators for serving Bun HTML bundles directly via `Bun.serve()`, bypassing the middleware chain
  - **Cron/Scheduled Tasks**: `@Schedule` decorator with `CronRunner` service using Bun's native `Bun.cron.parse()` for scheduled job execution
  - **Component Post-Processor**: `@PostProcessor` decorator for hooking into component lifecycle after initialization (instance transformation, metadata collection)
  - **WebSocket Transport Layer**: `WebSocketTransport` abstraction for multi-pod deployments with pluggable transports (Redis, NATS etc.), default `BunLocalTransport` for single-pod
  - **@All decorator**: Handle all HTTP methods on a single route
  - **@Route decorator**: Support for custom/non-standard HTTP methods (e.g., PURGE, LINK)
  - **SSE/Streaming types**: `AsenaStreamWriter` and `AsenaSSEStreamWriter` for streaming responses
  - **Metadata Extractor utilities**: Public API for reading controller metadata (`extractControllerRouteInfo`, `extractComponentName`, type checkers)
  - **Graceful shutdown**: `server.stop()` method with cron job cleanup

  ### Improvements
  - **OpenAPI preparation**: `summary` field added to all HTTP method decorators and controller params; `response()` method on validators for response schema documentation
  - **Controller description**: Optional `description` metadata on `@Controller` for documentation generators
  - **Duplicate route detection**: Prevents accidental route conflicts at startup with detailed error messages
  - **WebSocket heartbeat**: Configurable `sendPingStrategy` (`'adapter'` | `'native'`) and `heartbeatInterval` options
  - **Cross-pod messaging in Ulak**: Fallback to transport-based delivery when direct socket send fails

  ### Breaking Changes
  - Package export paths reorganized (`./web` → `./decorators/http`, `./server` → `./decorators`, `./ioc` → `./decorators/ioc`, `./ioc/system` split into `./ioc/types` and `./ioc/constants`)
  - `AsenaSocket.publish()` return type changed from `ServerWebSocketSendStatus` to `void`
  - `AsenaWebSocketServer` now wraps `WebSocketTransport` instead of Bun `Server`
  - `./utlis` export path typo fixed to `./utils`

## 0.6.3

### Patch Changes

- Improve type safety and documentation for server configuration
  - Add type-safe AsenaServerOptions excluding framework-managed properties (fetch, routes, websocket, error)
  - Add comprehensive Config.md documentation with Bun serve and WebSocket configuration examples
  - Improve async PostConstruct tests with 6 additional test cases for inheritance scenarios

## 0.6.2

### Patch Changes

- Added testing utilities with `mockComponent` and `mockComponentAsync` functions for automated dependency mocking in component tests.

## 0.6.1

### Patch Changes

- Add WebSocket subscriptions support for Bun 1.3.2
  - Exposed `subscriptions` property in `AsenaSocket` class to support Bun's native ServerWebSocket subscriptions feature
  - Upgraded to Bun 1.3.2 to utilize new WebSocket subscription capabilities
  - Maintained zero-dependency philosophy by leveraging Bun's native WebSocket implementation

## 0.6.0

### Minor Changes

- d1fd783: ## Event System

  Added Spring-like event-driven architecture.

  ```typescript
  @EventService({ prefix: 'user' })
  export class UserEventService {
    @On('created')
    handleUserCreated(eventName: string, data: any) {
      console.log('User created:', data);
    }

    @On('*.error') // Wildcard support
    handleErrors(eventName: string, data: any) {
      console.error('Error:', eventName);
    }
  }
  ```

  **Features:**
  - `@EventService` and `@On` decorators
  - Wildcard pattern support (`user.*`, `*.error`)
  - Fire-and-forget pattern
  - Async/sync handler support
  - Error isolation
  - Event chaining

  **Exports:**

  ```typescript
  import { EventService, On } from '@asenajs/asena/decorators';
  import { EventEmitter } from '@asenajs/asena/event';
  ```

  ## Breaking Changes (Adapter Developers Only)

  **WebSocket Refactoring - Circular Dependency Removal**

  `AsenaSocket` no longer holds a reference to `AsenaWebSocketService`.

  **Changes:**
  - `AsenaSocket` constructor: removed `websocketService` parameter, added `namespace: string`
  - Removed `cleanup()` method
  - Removed manual `rooms` management (using Bun native pub/sub)
  - Removed `getSocketsByRoom()` method from `AsenaWebSocketService`

  **Impact:**
  - ⚠️ HTTP/WebSocket adapter developers must update their code
  - ✅ End users are not affected

  **For adapter developers:**

  ```typescript
  // Before
  new AsenaSocket(ws, websocketService);

  // After
  new AsenaSocket(ws, namespace);
  ```

### Patch Changes

- ## Windows Path Compatibility Fix

  Fixed route path joining issue on Windows by normalizing backslashes to forward slashes.

  **Issue:** `path.join()` was using Windows backslashes (`\`) for route paths, causing adapter registration failures on Windows.

  **Solution:** Route paths are now normalized using `.replace(/\\/g, '/')` to ensure cross-platform compatibility.

  **Impact:**
  - ✅ Routes now work correctly on Windows
  - ✅ No breaking changes for users or adapter developers
  - ✅ Test coverage added for path normalization

  **Related:** Fixes #41

## 0.5.0

### Minor Changes

- # Ulak WebSocket Messaging System

  Add centralized WebSocket message broker (Ulak) that eliminates circular dependencies in WebSocket communication.

  **Features:**
  - Namespace-based routing for WebSocket messages
  - Type-safe messaging with full TypeScript support
  - Bulk operations for efficient multi-namespace broadcasting
  - Comprehensive error handling with UlakError
  - Pattern matching for exact and wildcard namespaces

  **Breaking Changes:**
  - `AsenaWebSocketServer` constructor no longer accepts `topic` parameter
  - `AsenaWebSocketServer.websocketCount` getter removed
  - Custom adapter implementations need to update their constructor calls

  **Bug Fixes:**
  - Fix IocEngine empty dependency error in non-minified codebases

  **Enhanced Features:**
  - @Inject decorator now supports tuple injection pattern for advanced DI scenarios

## 0.4.0

### Minor Changes

- a87c530: Core IoC migration with full dependency injection support

  ### Features
  - **Full IoC Container**: All core services now managed by IoC container
  - **AsenaServerFactory**: New factory pattern for server creation (replaces `new AsenaServer()`)
  - **Field-based Injection**: All services use `@Inject` decorator for clean dependency management
  - **Circular Dependency Detection**: Runtime detection with detailed error messages
  - **Symbol-based Metadata**: Type-safe metadata keys preventing external manipulation
  - **CoreContainer**: Framework-level container managing bootstrap sequence
  - **Lifecycle Hooks**: `onInit()` and `onDestroy()` support for core services

  ### Breaking Changes
  - `new AsenaServer()` is replaced with `AsenaServerFactory.create()`
  - Server configuration now uses options object instead of builder pattern

  **Before (v0.3.x):**

  ```typescript
  await new AsenaServer(adapter, logger).port(3000).start();
  ```

  **After (v0.4.x):**

  ```typescript
  const server = await AsenaServerFactory.create({
    adapter,
    logger,
    port: 3000,
  });
  await server.start();
  ```

  ### Internal Improvements
  - All 5 prepare services migrated to field injection
  - IocEngine now receives Container via injection
  - Bootstrap process split into 9 deterministic phases
  - 235 tests passing with 90%+ coverage
  - PrepareService base class removed (field injection pattern)

## 0.3.3

### Patch Changes

-
- 647b8d5: Fix WebSocket cleanup and unsubscribe mechanism
  - Fixed topic format inconsistency in subscribe/unsubscribe calls
  - Improved AsenaSocket cleanup to avoid modification during iteration
  - Enhanced unsubscribe method with safer filtering approach
  - Added comprehensive test coverage for memory leak prevention and topic format consistency

## 0.3.2

### Patch Changes

- d488206: Fix critical PostConstruct issues in IoC Container
  - Fixed PostConstruct methods being executed multiple times in inheritance chains
  - Fixed async PostConstruct not being awaited during singleton registration
  - Added comprehensive test coverage for PostConstruct behavior
  - Code cleanup: Removed debug console.log statements

  **Breaking Change:** Container.register() is now async - all register calls must be awaited

## 0.3.1

### Patch Changes

- fc9e310: Config service name undefined bug fixed

## 0.3.0

### Minor Changes

- b7aae6c: - Removed Winston dependency to reduce external dependencies. -
  - Implemented a new WebSocket adapter system for enhanced real-time communication capabilities.
  - Introduced a static serve API and configuration for serving static files.
  - Addressed various minor bugs. - Improved and fixed existing tests.
  - Added new tests to increase code coverage and ensure stability.
  - Performed general code cleanup and refactoring.

## 0.2.1

### Patch Changes

- da1d732: minor bugs on inheritance system fixed

## 0.2.0

### Minor Changes

- 2924af1: Inheritance bugs fixed. Hono adapter removed from asenajs.
