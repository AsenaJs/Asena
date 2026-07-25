---
'@asenajs/asena': minor
---

Fix `mockComponent` crash for services with `@Inject(ulak(...))` dependencies and improve expression handling:

- **Fix:** `mockComponent` no longer throws `TypeError: ulak.namespace is not a function` for expression-based injections (e.g. the `ulak()` helper). Expressions are now evaluated against a deep mock, so injected namespaces work out of the box and their methods are assertable Bun mocks.
- **Behavior change:** a field present in `overrides` is now used as the FINAL injected value — its `@Inject` expression is skipped instead of being applied on top of the override.
- **Behavior change:** override presence is checked with `Object.hasOwn`, so falsy override values (`0`, `''`, `null`, `undefined`) are injected as-is instead of being silently ignored.
- **New:** `createDeepMock()` exported from `@asenajs/asena/test` — Proxy-based deep mock where any property access yields a Bun mock and any call returns a chainable deep mock.
- **New:** `createTestUlakStub(path)` exported from `@asenajs/asena/test` — fully typed `Ulak.NameSpace` stub with all methods mocked.
