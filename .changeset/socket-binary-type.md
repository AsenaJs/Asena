---
'@asenajs/asena': minor
---

`AsenaSocket.binaryType` reaches the underlying Bun socket, so setting it changes the type of the binary messages the socket receives. This is a behaviour change for an application that already set it: the setter used to have no effect, so its handlers received the default `Buffer`; they now receive the type it asked for (`ArrayBuffer`, `Uint8Array`, ...).
