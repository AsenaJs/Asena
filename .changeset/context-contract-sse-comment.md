---
"@asenajs/asena": minor
---

Three context-contract changes, each spelled out so adapter authors can implement against them:

1. `AsenaContext.getQuery` now returns `Promise<string | undefined>`: `undefined` when the parameter is absent (never `''`); a parameter that is present but empty (`?name=`) is `''`. Adapters whose `getQuery` returned `''` for an absent key must return `undefined` instead.
2. `setResponseHeader` is documented to *replace* any existing value for that header, and a new optional `appendResponseHeader(key, value)` member *appends*, keeping existing values - the semantics multi-valued headers such as `Vary` and `Link` need. Cookies still go through `setCookie`, not through either method. Both members are optional, so existing adapters keep compiling; adapters that want append semantics implement `appendResponseHeader`.
3. `SSEMessage.data` is now optional and a new optional `comment` field emits `: <line>` lines (one per newline-separated line) that are invisible to `EventSource` clients - for keep-alive pings that must not look like an event. At least one of `data` / `comment` must be set; adapters throw when both are missing. Code that passed `data` as a required field keeps working unchanged.
