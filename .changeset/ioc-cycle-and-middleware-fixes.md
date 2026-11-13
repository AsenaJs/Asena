---
"@asenajs/asena": patch
---

Fix three IoC defects:

- Concurrent `resolve()` calls for the same or overlapping components no longer fail with a false `Circular dependency detected` error.
- A `@Middleware` class without `handle()` (or a `validator: true` class without a validator method) now throws a descriptive error at definition time instead of exiting the process with code 0, so broken apps and test files fail CI.
- A boot-time circular dependency error now lists the full loop (for example `A -> B -> A`) instead of naming only one component.
