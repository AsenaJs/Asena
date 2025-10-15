---
'@asenajs/asena': minor
---

Core IoC migration with full dependency injection support

### Features

- **Full IoC Container**: All core services now managed by IoC container
- **AsenaServerFactory**: New factory pattern for server creation (replaces `new AsenaServer()`)
- **Field-based Injection**: All services use `@Inject` decorator for clean dependency management
- **Circular Dependency Detection**: Runtime detection with detailed error messages
- **Symbol-based Metadata**: Type-safe metadata keys preventing external manipulation
- **CoreContainer**: Framework-level container managing bootstrap sequence
- **Lifecycle Hooks**: `onInit()` and `onDestroy()` support for core services

### Breaking Changes

- `new AsenaServer()` is replaced with `AsenaServerFactory.create()`
- Server configuration now uses options object instead of builder pattern

**Before (v0.3.x):**
```typescript
await new AsenaServer(adapter, logger).port(3000).start();
```

**After (v0.4.x):**
```typescript
const server = await AsenaServerFactory.create({
  adapter,
  logger,
  port: 3000
});
await server.start();
```

### Internal Improvements

- All 5 prepare services migrated to field injection
- IocEngine now receives Container via injection
- Bootstrap process split into 9 deterministic phases
- 235 tests passing with 90%+ coverage
- PrepareService base class removed (field injection pattern)
