---
"@asenajs/asena": minor
---

`createTestApp` now expands the `components` list with every class reachable through `@Inject(Class)`, so a test only names its roots (typically the controllers) instead of the whole injection closure. Discovered classes are registered for real; a name in `overrides` stops the walk, and core services (`ulak(...)`, the logger, ...) are skipped as before.

Two failure modes changed shape, both before anything boots:

- A dependency injected by name that is neither listed nor overridden fails with `createTestApp: missing dependencies:` followed by one `<Owner>.<field> ...` line per problem, instead of the container's bare `<key> is not registered` (or, under `createWebTest`, the adapter's 500 on the first request). If you were matching the old message text, update the matcher.
- `@Inject(SomeClass)` where `SomeClass` carries no component decorator is reported as `<Owner>.<field> injects <SomeClass>, which is not a decorated component`, instead of the old `undefined is not registered`.

`Container`'s missing-registration failure during dependency injection now reads `'<name>' is not registered (injected into <Class>.<field>)`, with the original error attached as `cause`. `CircularDependencyError` is thrown unchanged, and a nested miss (A→B→C with C missing) is wrapped exactly once, naming the innermost dependent.
