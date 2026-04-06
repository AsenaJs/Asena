---
"@asenajs/asena": minor
---

### New Features

- **Frontend Controller**: `@FrontendController` and `@Page` decorators for serving Bun HTML bundles directly via `Bun.serve()`, bypassing the middleware chain
- **Cron/Scheduled Tasks**: `@Schedule` decorator with `CronRunner` service using Bun's native `Bun.cron.parse()` for scheduled job execution
- **Component Post-Processor**: `@PostProcessor` decorator for hooking into component lifecycle after initialization (instance transformation, metadata collection)
- **WebSocket Transport Layer**: `WebSocketTransport` abstraction for multi-pod deployments with pluggable transports (Redis, NATS etc.), default `BunLocalTransport` for single-pod
- **@All decorator**: Handle all HTTP methods on a single route
- **@Route decorator**: Support for custom/non-standard HTTP methods (e.g., PURGE, LINK)
- **SSE/Streaming types**: `AsenaStreamWriter` and `AsenaSSEStreamWriter` for streaming responses
- **Metadata Extractor utilities**: Public API for reading controller metadata (`extractControllerRouteInfo`, `extractComponentName`, type checkers)
- **Graceful shutdown**: `server.stop()` method with cron job cleanup

### Improvements

- **OpenAPI preparation**: `summary` field added to all HTTP method decorators and controller params; `response()` method on validators for response schema documentation
- **Controller description**: Optional `description` metadata on `@Controller` for documentation generators
- **Duplicate route detection**: Prevents accidental route conflicts at startup with detailed error messages
- **WebSocket heartbeat**: Configurable `sendPingStrategy` (`'adapter'` | `'native'`) and `heartbeatInterval` options
- **Cross-pod messaging in Ulak**: Fallback to transport-based delivery when direct socket send fails

### Breaking Changes

- Package export paths reorganized (`./web` → `./decorators/http`, `./server` → `./decorators`, `./ioc` → `./decorators/ioc`, `./ioc/system` split into `./ioc/types` and `./ioc/constants`)
- `AsenaSocket.publish()` return type changed from `ServerWebSocketSendStatus` to `void`
- `AsenaWebSocketServer` now wraps `WebSocketTransport` instead of Bun `Server`
- `./utlis` export path typo fixed to `./utils`
