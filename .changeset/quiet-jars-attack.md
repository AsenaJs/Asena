---
'@asenajs/asena': patch
---

Fix a startup deadlock: the component scan no longer imports the application entry file

`IocEngine.loadComponents()` imported every file under `sourceFolder`, including the entry
file itself. While the entry awaits `AsenaServerFactory.create()` at module scope it is in
the *evaluating-async* state, so that self-import is a cyclic dynamic import which can only
settle once the scan returns. Bun 1.3.14 follows the specification here and waits, so every
application booted from source with the documented top-level-await bootstrap hung after the
banner - no error, no log, no exit. Earlier Bun versions short-circuited it, which is why
this went unnoticed since 0.3.0.

The scan now excludes both the configured `rootFile` and the module actually being executed
(`Bun.main`). **Declaring components directly in the entry file keeps working**: component
decorators register their class in a registry as they run, and the scan reads entry-file
components from there instead of importing the file. Components declared *below* the
bootstrap call have not been evaluated in time to be registered, and are now reported by
name at startup rather than silently missing.

Also in this release:

- A component file that fails to import now aborts startup instead of being skipped with a
  `console.error`, which used to leave the server running with components silently absent.
  Import errors and other engine diagnostics go through the framework logger.
- An import that has not settled after 10s is reported by file name, so a never-resolving
  top-level await in application code is diagnosable instead of an unexplained hang. Tunable
  via `importTimeout` in `asena-config.ts`.
- `asena-config.ts` is looked up directly in the project root before falling back to a walk,
  and the walk now skips `node_modules` and dotfolders and is ordered. Previously every boot
  stat'ed the entire project - tens of thousands of files - and the first match won in
  undefined directory order, so a dependency shipping a matching filename could be picked up
  instead of the project's own config.
- An absolute `sourceFolder` no longer breaks the scan: paths were joined onto `process.cwd()`
  unconditionally, so every import failed and the boot ended with a generic
  `No components found`.
- New `isValidationError()` guard and `ValidationErrorLike` contract in `@asenajs/asena/adapter`,
  used by the adapters to report request validation failures through `ConfigService.onError`.
