---
"@asenajs/asena": patch
---

`AsenaWebsocketAdapter` now declares `shutdown(timeoutMs?: number): Promise<void>`, the hook an adapter's `stop()` calls to close every open WebSocket connection within `timeoutMs`. The base implementation closes nothing and logs a warning naming the adapter class, so a WebSocket adapter that does not override it keeps compiling and running; adapters that accept connections should override it. The first-party ergenecore and hono adapters already do.
