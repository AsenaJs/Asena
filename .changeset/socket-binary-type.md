---
'@asenajs/asena': patch
---

`AsenaSocket.binaryType` reaches the underlying Bun socket, so setting it changes the type of the binary messages the socket receives.
