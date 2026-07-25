---
'@asenajs/asena': minor
---

Add an integration test harness to `@asenajs/asena/test` and fix `mockComponent` auto-mocking:

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
