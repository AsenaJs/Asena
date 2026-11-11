---
'@asenajs/asena': patch
---

Under `bun --hot` and `bun --watch`, a shutdown signal ends the process once every `stop()` running in it has settled - an explicit `stop()` on another server included - with code 0, or 1 when the shutdown failed. Another listener of the same signal, such as a telemetry exporter's own hook, can finish first: the exit waits until the event loop empties, at most `shutdown.timeout` (default 5000 ms). Bun's file watcher would otherwise hold the process open after the stop. Without those flags a signal still leaves the process to the event loop, and an explicit `stop()` never exits.

A shutdown started by a signal that fails ends the process with exit code 1, with or without those flags. It fails when `stop()` rejects - an adapter or transport that will not close - or when an `@OnStop` hook throws, rejects or runs out of `shutdown.timeout`; each failure is logged, and the remaining hooks and teardown steps still run. Without the flags the process still exits on its own: core sets `process.exitCode` to 1 unless the application already set a non-zero code. A supervisor or CI step that treats a non-zero exit as an error sees such a shutdown as one. A clean shutdown exits 0, and an explicit `server.stop()` does not set the exit code.

A second shutdown signal while a signal-triggered stop is draining ends the process at once with `128 + signal number` (130 for SIGINT, 143 for SIGTERM), also when another listener of that signal would take the runtime's default action away, and under `bun --watch` too.
