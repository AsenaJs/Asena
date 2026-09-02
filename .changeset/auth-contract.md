---
"@asenajs/asena": minor
---

New `@asenajs/asena/auth` export: the shared auth contract every auth implementation
can depend on without depending on each other. It ships the provider interface
(`AsenaAuthProvider`, `RolesResolver`), the session shapes (`AuthUser`, `AuthSession`),
the wire constants (`AUTH_PROVIDER_KEY`, `AUTH_SESSION_CONTEXT_KEY`), the marker
decorators `@Protected` / `@Public` / `@Roles`, the guard-mark readers
(`collectGuardMetadata`, `effectiveGuardMark`) and the context helpers
`getAuthSession` / `requireAuthSession` (which throws an `HttpException` 401 on
`undefined` and `null` alike). Core itself never calls any of it.

Guard marks are override semantics, deliberately unlike `@Transaction`'s accumulation:
a subclass mark replaces the inherited one (a subclass `@Public` cancels a base
`@Protected`), and a method mark never inherits `roles`/`provider` from the class
mark. When two guard decorators stack on one target the one applied last wins
entirely - with legacy decorators that is the one written above the other. The
`AsenaVariables` context interface gains an optional `authSession` member
(`undefined` = not resolved, `null` = anonymous), which is additive: code that
never touches the key is unaffected.
