---
'@asenajs/asena': patch
---

`socket.publish()` excludes the sender regardless of the configured transport

`AsenaSocket.publish()` branched between two Bun primitives and treated them as interchangeable.
They are not: `ws.publish()` is socket-level and leaves the publishing socket out, while
`transport.publish()` ends in `server.publish()`, which cannot exclude anything. Whether a socket
received its own message therefore depended on whether the application defined `transport()` in
its `@Config` — a hook documented as being about cross-pod delivery.

The symptom in production was a duplicate frame: after a `RedisTransport` was added for multi-pod
deployment, every `connect` event started arriving twice, with no application change to point at.
Applications that had compensated for the exclusion with an extra `ws.send()` — the natural reading
of Bun's semantics — were the ones that broke. `publishText()` and `publishBinary()` had the same
divergence.

Local delivery now always goes through `ws.publish()`, and the transport contributes the other pods
on top of it:

```ts
socket.publish(topic, data);
// -> ws.publish(topic, data)                local, sender excluded
// -> transport.publishRemote(topic, data)   other pods, no local delivery
```

`WebSocketTransport` gains an optional `publishRemote(topic, data)` for that second half — the
broker publish alone, with no `server.publish()`. `BunLocalTransport` implements it as a no-op,
since there is no other pod to reach. `AsenaWebSocketServer.to()` is unchanged and still calls
`publish()`, reaching every subscriber including the sender; that difference between the two APIs
is now the only one, and it is deliberate.

**Custom transports should implement `publishRemote()`.** It is optional only for backwards
compatibility: a transport without it keeps the old behaviour — `socket.publish()` falls back to
`publish()`, so the sender is included — and the adapter warns once at startup. Making it required
would have been the cleaner contract, but the alternative reading of a missing method, "forward
nowhere", drops every cross-pod message in silence, and a wrong-but-delivered message beats a lost
one. The fallback is removed in the next major.

Behaviour change for applications running **with** a transport: `socket.publish()` no longer
delivers to the publishing socket. If yours relied on that, send to it explicitly with `ws.send()`,
or use the service-level `this.to()`, which reaches everyone.

Released as a patch deliberately. Every dependent package declares `@asenajs/asena: ^0.10.0`, and a
caret range on a 0.x version does not cross a minor — a `0.11.0` would have made all nine of them
uninstallable the moment core landed, and core publishes first. The cost is that the range no longer
pins the pairing: an application can resolve core `0.10.0` alongside an adapter that expects
`publishRemote()`, in which case `socket.publish()` takes the legacy branch (sender included) and
the adapter warns once at startup. Loud and reversible, unlike nine broken installs.
