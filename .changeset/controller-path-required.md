---
"@asenajs/asena": patch
---

`@Controller({ middlewares: [...] })` written without a `path` threw a raw `TypeError: Cannot read properties of undefined (reading 'replace')` at decoration time. It now throws an error naming the controller and the fix: `@Controller on <Class>: "path" is required - use path: '/' for root-level routes`. `@Controller()` and `@Controller('')` are unchanged and still mount at `/`.
