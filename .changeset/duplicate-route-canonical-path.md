---
"@asenajs/asena": minor
---

Duplicate-route detection compares canonical paths, so a pair that differs only in a trailing slash is caught at boot instead of registering twice with one handler silently shadowing the other. `@Controller('/api')` with `@Get('/users')` and `@Controller('/api/users')` with `@Get('/')` both resolve to `GET /api/users` and fail the boot naming both controllers and both handlers; the `@All` conflict scan uses the same canonical path. The path handed to the adapter is unchanged.

This is a boot-time behavior change: an application that declares the same method on both `/x` and `/x/` booted before - with one handler silently answering both spellings on either adapter - and now fails to start until one of the two routes is removed.
