---
'@asenajs/asena': minor
---

Add shared Standard Schema v1 route context contracts, metadata resolution, and per-route legacy validator cache configuration. Legacy schema factories now run once at startup by default; use `validatorCache: false` for request-time factories.
