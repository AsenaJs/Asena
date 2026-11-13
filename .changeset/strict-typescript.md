---
"@asenajs/asena": patch
---

Compile the package under `strict` and fix what that surfaced:

- A class-based `@Inject(Class)` is looked up by the dependency's registered name at boot as well as at resolve time, so a dependency listed after its dependent boots.
- `@OnStart`, `@PostConstruct` and `@OnStop` accept symbol-keyed methods and run them like string-named ones. A symbol-keyed `@OnStop` used to abort `server.stop()` with a `TypeError`.
- `@Inject(Class)` and `@Strategy(Class)` of a class that is not a registered component fall back to the class name, as the container already does when it reads component names.
- `container.registerInstance()` rejects `null` and `undefined` with a `TypeError` before the key is taken.
- `AsenaWebSocketService.to()` throws `WebSocket server is not attached` when no server is attached, and a static serve class that is not a component throws `Static Serve service <name> not found.` instead of resolving an undefined key.

Public type changes:

- `Container.getStartHooks()` and `Container.getStopHooks()` return `(string | symbol)[]` (was `string[]`).
- `Container.resolveAll()` is inferred as returning `null` in addition to the array; strict callers must handle it.
- `DEFAULT_PARAMS` is typed with `middlewares`, `summary` and `description` required; `generateHandlerParams()` returns `Omit<ApiParams, 'method'>`, and fields passed as `undefined` now fall back to their defaults.
- `defineComponent(params?)`, `IocEngine.setConfig(config?: IocConfig | null)`, `getStrategyClass(interfaceNames | undefined)` and `readJson(path: string)` (was `any`).
- `prepare()` of `PrepareConfigService`, `PrepareStaticServeConfigService`, `PrepareValidatorService` and `PrepareWebsocketService` may resolve to `undefined`; `PrepareStaticServeConfigService.prepare()` accepts `undefined`.
- Type declarations now state what the runtime already returns: `staticServe` and `validator` on route params are optional, `BaseStaticServeParams` fields are optional, `InjectableComponent.interface` may be `undefined`, `AsenaSocket.binaryType` may be `undefined`, and `AsenaWebSocketService.server` may be `null` before it is attached.
