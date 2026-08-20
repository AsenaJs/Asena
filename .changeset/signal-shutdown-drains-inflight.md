---
"@asenajs/asena": patch
---

Graceful shutdown drains in-flight HTTP requests

- A signal-triggered shutdown now stops the HTTP adapter with drain instead of force-closing active connections; an orchestrator's SIGTERM means "drain and go", and `forceExitAfter` still bounds the wait
- New `shutdown.closeActiveConnections` (default `false` on the signal path) and `shutdown.drainTimeout` options configure the behavior; explicit `server.stop()` calls keep their own default unchanged
- `stop()` now warns when a later call asks for a different draining mode than a shutdown already in progress, instead of silently letting the latch swallow it
