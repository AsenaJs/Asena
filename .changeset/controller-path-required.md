---
"@asenajs/asena": patch
---

`@Controller({ middlewares: [...] })` written without a `path` threw a raw `TypeError: Cannot read properties of undefined (reading 'replace')` at decoration time, `@FrontendController({})` threw the same `TypeError`, and `@WebSocket` without a path printed a message and called `process.exit()`. All three throw the same error naming the decorator, the class and the fix: `@Controller on <Class>: "path" is required - use path: '/' for root-level routes` (with `@FrontendController` / `@WebSocket` in place of `@Controller`). The class is left unregistered. `@Controller()` and `@Controller('')` are unchanged and still mount at `/`; `@WebSocket('')` is still rejected.
