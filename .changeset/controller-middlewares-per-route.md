---
"@asenajs/asena": minor
---

Controller-level middlewares are attached to each of the controller's own routes instead of being registered as a `/prefix/*` pattern. A controller mounted at `/`, `''` or a path with a trailing slash (`/admin/`) now runs its middlewares on every route (they never ran before), and a controller at `/api` no longer runs its middlewares for an unrelated controller at `/api/open`. Controller middlewares run only for routes the controller declares: not for unmatched paths under its prefix (404s) and not for `OPTIONS` preflight of routes without an `OPTIONS` handler — put `CorsMiddleware` in `globalMiddlewares()`. Pipeline per route: global → controller → route → validator → handler (validator-before-route-middleware on hono-adapter < 5.0.0).
