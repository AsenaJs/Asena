---
'@asenajs/asena': patch
---

A failed `@OnStart` hook's boot log line now includes the cause, e.g. `@OnStart hook 'Db.open()' failed: connection refused`. `@OnStop` failure lines print the cause chain too (and no longer print `undefined` for a non-Error throw), and shutdown-step and unhandled-error lines append `Caused by: ...` after the stack. The thrown errors are unchanged.
