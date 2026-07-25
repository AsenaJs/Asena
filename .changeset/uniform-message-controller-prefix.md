---
'@asenajs/asena': minor
---

### Breaking Changes

- **The `@MessageController` prefix is now applied to `@EventPattern` too.** Previously it was joined onto `@MessagePattern` patterns only and event patterns were always absolute. The prefix is now joined onto **every** handler in the controller, and a handler opts out with `prefix: false`.

  ```typescript
  // Before (0.7)
  @MessageController('order')
  class OrderHandler {
    @MessagePattern('create')          // -> 'order.create'
    @EventPattern('payment.completed') // -> 'payment.completed'
  }

  // After (0.8)
  @MessageController('order')
  class OrderHandler {
    @MessagePattern('create')          // -> 'order.create'   (unchanged)
    @EventPattern('created')           // -> 'order.created'  (prefix now applied)
    @EventPattern({ pattern: 'payment.completed', prefix: false }) // -> 'payment.completed'
  }
  ```

  **Why:** the outbound client side already prefixed events. `ulak.messages('order').emit('created')` publishes `order.created`, but `@MessageController('order') @EventPattern('created')` subscribed to bare `created` — sender and listener disagreed, and the message was silently lost. One rule now governs both directions, and it matches the in-process `@EventService`/`@On` system.

  **Migration:** every `@EventPattern` on a **prefixed** controller must be either rewritten relative to the prefix or given `prefix: false`. Controllers without a prefix are unaffected. Asena logs the resolved patterns for each controller at boot so the result is visible immediately:

  ```
  [Microservice] OrderHandler → "default" (prefix "order") msg: order.create | evt: order.created
  ```

- **`@EventPattern('*')` under a prefix is no longer a global catch-all** — it resolves to `order.*`, which matches `order.created` and `order.item.added` but not `payment.completed` or the bare `order`. Audit and logging listeners that must see every event need `prefix: false`.

- **A wildcard `@MessageController` prefix is now a boot error.** `@MessageController('order.*')` previously only failed if the controller had a `@MessagePattern` (the transport vetoed the joined result); on the event side it would now silently produce subscriptions like `order.*.created`. It is rejected at boot with the controller name and the `prefix: false` escape hatch in the message.

- **Kafka external topics:** a handler for a foreign topic on a prefixed controller now registers under the joined name and **stops consuming**, while the service still boots green and reports healthy. Add `prefix: false` to those `@EventPattern`s. `@asenajs/asena-kafka` prints a hint at `listen()` naming the shadowed handler.

### New

- **`prefix: false` on `@MessagePattern` and `@EventPattern`** — registers the pattern verbatim, ignoring the controller prefix. `prefix: false` does not relax the `@MessagePattern` wildcard ban; request/response still requires exact routing.
- **`prefix: false` on `@On`** — the in-process event system gains the same opt-out. Previously an `@EventService('user')` class could not listen to an absolute pattern at all without a second, prefix-less service. Purely additive; the default stays `true`.
- **`PatternHandlerIndex.patterns()`** (`@asenajs/asena/event`) — lists registered patterns, exact first then wildcard. Diagnostics only; used by transports to explain why an expected source matched no handler.
- Message and event pattern validation errors in `InMemoryTransport` now mention the `prefix: false` escape hatch.
