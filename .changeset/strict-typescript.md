---
"@asenajs/asena": patch
---

Compile the package under `strict` and fix what that surfaced:

- Field decorators (`@Inject`, `@Value`, `@Strategy`, `@OnStart`, `@OnStop`, `@Override`) throw a `TypeError` for a symbol-keyed member instead of silently ignoring it.
- `@Inject(Class)` and `@Strategy(Class)` of a class that is not a registered component fall back to the class name, as the container already does when it reads component names.
- Type declarations now state what the runtime already returns: `staticServe` and `validator` on route params are optional, `BaseStaticServeParams` fields are optional, `InjectableComponent.interface` may be `undefined`, `AsenaSocket.binaryType` may be `undefined`, and `AsenaWebSocketService.server` may be `null` before it is attached.
