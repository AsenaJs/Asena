---
'@asenajs/asena': patch
---

Under `bun --hot` and `bun --watch`, a shutdown signal ends the process with code 0 once `stop()` has settled, on every server in the process, also when it rejected (the failure is logged). Bun's file watcher would otherwise hold the process open after the stop. Without those flags a signal still leaves the process to the event loop, and an explicit `stop()` never exits.
