---
'@asenajs/asena': patch
---

Align `AsenaSocket` with `@types/bun` 1.4.4: `binaryType` accepts `'blob'`, and `cork()` passes the socket's real `ServerWebSocket<WebSocketData<T>>` to its callback with an independent return type.
