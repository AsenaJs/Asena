---
'@asenajs/asena': patch
---

Under `bun --hot` and `bun --watch`, a shutdown signal ends the process once every `stop()` running in it has settled - an explicit `stop()` on another server included - with code 0, or 1 when a signal-triggered stop failed (the failure is logged). Another listener of the same signal, such as a telemetry exporter's own hook, can finish first: the exit waits until the event loop empties, at most `shutdown.timeout` (default 5000 ms). Bun's file watcher would otherwise hold the process open after the stop. Without those flags a signal still leaves the process to the event loop, and an explicit `stop()` never exits.

A second shutdown signal while a signal-triggered stop is draining ends the process at once with `128 + signal number` (130 for SIGINT, 143 for SIGTERM), also when another listener of that signal would take the runtime's default action away, and under `bun --watch` too.
