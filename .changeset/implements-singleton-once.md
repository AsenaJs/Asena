---
'@asenajs/asena': patch
---

An `@Implements` singleton is constructed once. Its interface key now reaches the same instance as its name, so `@OnStart` / `@OnStop` run once, `@Inject` and `@Strategy` share one object, and component scans (`@On` handlers, exception handlers, the headless warning) find the component once.
