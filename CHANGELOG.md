# @asenajs/asena

## 0.6.1

### Patch Changes

- Add WebSocket subscriptions support for Bun 1.3.2
  - Exposed `subscriptions` property in `AsenaSocket` class to support Bun's native ServerWebSocket subscriptions feature
  - Upgraded to Bun 1.3.2 to utilize new WebSocket subscription capabilities
  - Maintained zero-dependency philosophy by leveraging Bun's native WebSocket implementation

## 0.6.0

### Minor Changes

- d1fd783: ## Event System

  Added Spring-like event-driven architecture.

  ```typescript
  @EventService({ prefix: 'user' })
  export class UserEventService {
    @On('created')
    handleUserCreated(eventName: string, data: any) {
      console.log('User created:', data);
    }

    @On('*.error') // Wildcard support
    handleErrors(eventName: string, data: any) {
      console.error('Error:', eventName);
    }
  }
  ```

  **Features:**
  - `@EventService` and `@On` decorators
  - Wildcard pattern support (`user.*`, `*.error`)
  - Fire-and-forget pattern
  - Async/sync handler support
  - Error isolation
  - Event chaining

  **Exports:**

  ```typescript
  import { EventService, On } from '@asenajs/asena/decorators';
  import { EventEmitter } from '@asenajs/asena/event';
  ```

  ## Breaking Changes (Adapter Developers Only)

  **WebSocket Refactoring - Circular Dependency Removal**

  `AsenaSocket` no longer holds a reference to `AsenaWebSocketService`.

  **Changes:**
  - `AsenaSocket` constructor: removed `websocketService` parameter, added `namespace: string`
  - Removed `cleanup()` method
  - Removed manual `rooms` management (using Bun native pub/sub)
  - Removed `getSocketsByRoom()` method from `AsenaWebSocketService`

  **Impact:**
  - ⚠️ HTTP/WebSocket adapter developers must update their code
  - ✅ End users are not affected

  **For adapter developers:**

  ```typescript
  // Before
  new AsenaSocket(ws, websocketService);

  // After
  new AsenaSocket(ws, namespace);
  ```

### Patch Changes

- ## Windows Path Compatibility Fix

  Fixed route path joining issue on Windows by normalizing backslashes to forward slashes.

  **Issue:** `path.join()` was using Windows backslashes (`\`) for route paths, causing adapter registration failures on Windows.

  **Solution:** Route paths are now normalized using `.replace(/\\/g, '/')` to ensure cross-platform compatibility.

  **Impact:**
  - ✅ Routes now work correctly on Windows
  - ✅ No breaking changes for users or adapter developers
  - ✅ Test coverage added for path normalization

  **Related:** Fixes #41

## 0.5.0

### Minor Changes

- # Ulak WebSocket Messaging System

  Add centralized WebSocket message broker (Ulak) that eliminates circular dependencies in WebSocket communication.

  **Features:**
  - Namespace-based routing for WebSocket messages
  - Type-safe messaging with full TypeScript support
  - Bulk operations for efficient multi-namespace broadcasting
  - Comprehensive error handling with UlakError
  - Pattern matching for exact and wildcard namespaces

  **Breaking Changes:**
  - `AsenaWebSocketServer` constructor no longer accepts `topic` parameter
  - `AsenaWebSocketServer.websocketCount` getter removed
  - Custom adapter implementations need to update their constructor calls

  **Bug Fixes:**
  - Fix IocEngine empty dependency error in non-minified codebases

  **Enhanced Features:**
  - @Inject decorator now supports tuple injection pattern for advanced DI scenarios

## 0.4.0

### Minor Changes

- a87c530: Core IoC migration with full dependency injection support

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
    port: 3000,
  });
  await server.start();
  ```

  ### Internal Improvements
  - All 5 prepare services migrated to field injection
  - IocEngine now receives Container via injection
  - Bootstrap process split into 9 deterministic phases
  - 235 tests passing with 90%+ coverage
  - PrepareService base class removed (field injection pattern)

## 0.3.3

### Patch Changes

-
- 647b8d5: Fix WebSocket cleanup and unsubscribe mechanism
  - Fixed topic format inconsistency in subscribe/unsubscribe calls
  - Improved AsenaSocket cleanup to avoid modification during iteration
  - Enhanced unsubscribe method with safer filtering approach
  - Added comprehensive test coverage for memory leak prevention and topic format consistency

## 0.3.2

### Patch Changes

- d488206: Fix critical PostConstruct issues in IoC Container
  - Fixed PostConstruct methods being executed multiple times in inheritance chains
  - Fixed async PostConstruct not being awaited during singleton registration
  - Added comprehensive test coverage for PostConstruct behavior
  - Code cleanup: Removed debug console.log statements

  **Breaking Change:** Container.register() is now async - all register calls must be awaited

## 0.3.1

### Patch Changes

- fc9e310: Config service name undefined bug fixed

## 0.3.0

### Minor Changes

- b7aae6c: - Removed Winston dependency to reduce external dependencies. -
  - Implemented a new WebSocket adapter system for enhanced real-time communication capabilities.
  - Introduced a static serve API and configuration for serving static files.
  - Addressed various minor bugs. - Improved and fixed existing tests.
  - Added new tests to increase code coverage and ensure stability.
  - Performed general code cleanup and refactoring.

## 0.2.1

### Patch Changes

- da1d732: minor bugs on inheritance system fixed

## 0.2.0

### Minor Changes

- 2924af1: Inheritance bugs fixed. Hono adapter removed from asenajs.
