---
"@asenajs/asena": minor
---

## Event System

Added Spring-like event-driven architecture.

```typescript
@EventService({ prefix: 'user' })
export class UserEventService {
  @On('created')
  handleUserCreated(eventName: string, data: any) {
    console.log('User created:', data);
  }

  @On('*.error')  // Wildcard support
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
new AsenaSocket(ws, websocketService)

// After
new AsenaSocket(ws, namespace)
```
