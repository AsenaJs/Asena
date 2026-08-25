---
"@asenajs/asena": minor
---

Adds a `@Value(key, options?)` property decorator for configuration injection. Fields
decorated with `@Value` are resolved from `process.env[key]` when the container builds a
component: an optional `parse` function converts the raw string (e.g. `parse: Number`), and
an optional `default` is used when the variable is not set — its presence is what counts, so
`0`, `''` and `null` are honored. A variable that is not set on a field without a default
fails the component's construction (at registration for a singleton, at the first resolve for
a transient) with an error naming the class, the field and the key.

`mockComponent()` applies the same resolution, and a field present in its `overrides`
option wins over the environment without reading it. Values land as plain writable
properties, and a field initializer keeps precedence over the environment. No breaking
changes: existing decorators and container behaviour are untouched.
