---
"@asenajs/asena": patch
---

Fix dependency resolution and component decorator defects:

- Concurrent `resolve()` calls for the same or overlapping components no longer fail with a false `Circular dependency detected` error.
- A boot-time circular dependency error now lists the full loop (for example `A -> B -> A`) instead of naming only one component.
- A `@Middleware` class without `handle()` (or a `validator: true` class without a validator method) now throws a descriptive error at definition time instead of exiting the process with code 0, so broken apps and test files fail CI.
- A `resolveAll()` called from a prototype's start hook or post-processor that would rebuild its own caller now throws `CircularDependencyError` instead of recursing until memory runs out. A `resolveAll()` inside a hook may therefore throw where it used to hang.
