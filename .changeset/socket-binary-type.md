---
'@asenajs/asena': minor
---

`AsenaSocket.binaryType` reaches the underlying Bun socket, so setting it changes the type of the binary messages the socket receives. This is a behaviour change for an application that already set it: the setter used to have no effect, so its handlers received the default `Buffer`; they now receive the type it asked for (`ArrayBuffer`, `Uint8Array`, ...).

`AsenaWebSocketService.onMessage` types its message as `string | Buffer | ArrayBuffer | Uint8Array | Blob`, so a handler for a socket with another `binaryType` needs no cast. An override that declares `(ws, message: Buffer | string)` still compiles.
