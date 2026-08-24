---
"@asenajs/asena": minor
---

Adds an `imports` option to `AsenaServerFactory.create` (and `createTestApp`) for registering ready-made components handed in by packages, and teaches the factory to consume the build-time component list published by `asena build`.

`imports` accepts classes (or one-level-nested arrays of them) and registers them **in addition to** whatever the other sources found — the filesystem scan, an explicit `components` list, or the build list — never as a replacement. Every entry must carry its own component decorator (`@Service`, `@Controller`, `@Middleware`, ...); an undecorated entry now throws `imports[<index>] (<name>) carries no component decorator ...` instead of being silently dropped. A name collision between an import and a scanned class still fails with the existing `Duplicate component name detected` error.

The primary component source keeps its precedence: explicit non-empty `components` first, then the list `asena build` publishes on `globalThis[Symbol.for('asena.buildComponents')]` before the entry module evaluates (also readable via the new `getBuildComponents()` export), then the `sourceFolder` scan. Imports alone — no `components`, no build list, no config — are a valid component source and are registered instead of throwing `No components or configuration found`.
