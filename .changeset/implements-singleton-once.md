---
'@asenajs/asena': patch
---

An `@Implements` singleton is constructed once. Its interface key now reaches the same instance as its name, so `@OnStart` / `@OnStop` run once, `@Inject` and `@Strategy` share one object, and component scans (`@On` handlers, exception handlers, the headless warning) find the component once.

A test double passed through `overrides` under a component's name now also answers its `@Implements` interface key, so `@Strategy('IMailer')` sees the double instead of an empty slot. Overriding the interface key itself still replaces the whole slot.

A field injected by an interface key - `@Inject('IPaymentGateway')` - now orders its implementations before the dependent. It used to pass or fail with "'IPaymentGateway' is not registered" depending on the order of the component list.
