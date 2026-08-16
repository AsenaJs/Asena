import { describe, expect, mock, test } from 'bun:test';
import { AsenaSocket } from '../../../lib/server/web/websocket';
import type { WebSocketTransport } from '../../../lib/server/web/websocket';

function createMockWs(namespace = 'chat') {
  return {
    data: { id: 'socket-1', path: namespace, values: {} },
    send: mock(() => 0),
    sendText: mock(() => 0),
    sendBinary: mock(() => 0),
    publish: mock(() => 0),
    publishText: mock(() => 0),
    publishBinary: mock(() => 0),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    close: mock(() => {}),
    terminate: mock(() => {}),
    ping: mock(() => 0),
    pong: mock(() => 0),
    cork: mock(() => {}),
    getBufferedAmount: mock(() => 0),
    isSubscribed: mock(() => false),
    remoteAddress: '127.0.0.1',
    readyState: 1,
    binaryType: 'arraybuffer' as const,
    subscriptions: [],
  } as any;
}

/**
 * A transport on the current contract: `publish()` for full fan-out, `publishRemote()` for the
 * cross-pod wire alone.
 */
function createMockTransport(): WebSocketTransport & {
  publish: ReturnType<typeof mock>;
  publishRemote: ReturnType<typeof mock>;
} {
  return {
    publish: mock(() => {}),
    publishRemote: mock(() => {}),
  };
}

/**
 * A transport written before `publishRemote()` existed. Kept as a fixture because the fallback
 * branch it exercises is the one thing standing between such a transport and silent loss of every
 * cross-pod message.
 */
function createLegacyMockTransport(): WebSocketTransport & { publish: ReturnType<typeof mock> } {
  return {
    publish: mock(() => {}),
  };
}

describe('AsenaSocket - Transport Routing', () => {
  /**
   * The load-bearing rule: `socket.publish()` delivers locally through Bun's socket-level
   * `ws.publish()`, which is the only primitive that leaves the publishing socket out, and the
   * transport only adds the other pods on top. Routing local delivery through the transport
   * instead - which ends in `server.publish()`, and cannot exclude anything - meant configuring a
   * transport silently changed *who* received a message, not just how far it travelled. That
   * surfaced in production as every frame arriving twice after a Redis transport was added, with
   * no application change to point at.
   */
  describe('publish with transport', () => {
    test('should deliver locally via ws.publish and forward to other pods', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publish('room-1', 'hello');

      expect(ws.publish).toHaveBeenCalledWith('chat.room-1', 'hello', undefined);
      expect(transport.publishRemote).toHaveBeenCalledWith('chat.room-1', 'hello');
      expect(transport.publish).not.toHaveBeenCalled();
    });

    test('should use ws.publish when no transport', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat'); // no transport

      socket.publish('room-1', 'hello');

      expect(ws.publish).toHaveBeenCalledWith('chat.room-1', 'hello', undefined);
    });

    test('should deliver text locally via ws.publishText and forward to other pods', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publishText('room-1', 'hello text');

      expect(ws.publishText).toHaveBeenCalledWith('chat.room-1', 'hello text', undefined);
      expect(transport.publishRemote).toHaveBeenCalledWith('chat.room-1', 'hello text');
      expect(transport.publish).not.toHaveBeenCalled();
    });

    test('should use ws.publishText when no transport', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat');

      socket.publishText('room-1', 'hello text');

      expect(ws.publishText).toHaveBeenCalledWith('chat.room-1', 'hello text', undefined);
    });

    test('should deliver binary locally via ws.publishBinary and forward to other pods', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      const buffer = new ArrayBuffer(8);

      socket.publishBinary('room-1', buffer);

      expect(ws.publishBinary).toHaveBeenCalledWith('chat.room-1', buffer, undefined);
      expect(transport.publishRemote).toHaveBeenCalledWith('chat.room-1', buffer);
      expect(transport.publish).not.toHaveBeenCalled();
    });

    test('should use ws.publishBinary when no transport', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat');

      const buffer = new ArrayBuffer(8);

      socket.publishBinary('room-1', buffer);

      expect(ws.publishBinary).toHaveBeenCalledWith('chat.room-1', buffer, undefined);
    });

    test('should prefix topic with namespace (createTopic)', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'notifications', transport);

      socket.publish('user-123', 'you have mail');

      expect(ws.publish).toHaveBeenCalledWith('notifications.user-123', 'you have mail', undefined);
      expect(transport.publishRemote).toHaveBeenCalledWith('notifications.user-123', 'you have mail');
    });

    test('should pass compress through to the local publish', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publish('room-1', 'hello', true);

      expect(ws.publish).toHaveBeenCalledWith('chat.room-1', 'hello', true);
    });
  });

  /**
   * Backwards compatibility for third-party transports written before `publishRemote()`. Their
   * `publish()` does local delivery itself, so ours must not run as well - the message would
   * arrive twice locally. The sender is included on this path, which is the old inconsistent
   * behaviour; the adapter warns once at startup rather than dropping cross-pod delivery in
   * silence, which is the worse of the two failures. Removed in the next major.
   */
  describe('publish with a legacy transport (no publishRemote)', () => {
    test('should route publish through transport.publish and skip local delivery', () => {
      const ws = createMockWs();
      const transport = createLegacyMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publish('room-1', 'hello');

      expect(transport.publish).toHaveBeenCalledWith('chat.room-1', 'hello');
      expect(ws.publish).not.toHaveBeenCalled();
    });

    test('should route publishText through transport.publish', () => {
      const ws = createMockWs();
      const transport = createLegacyMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publishText('room-1', 'hello text');

      expect(transport.publish).toHaveBeenCalledWith('chat.room-1', 'hello text');
      expect(ws.publishText).not.toHaveBeenCalled();
    });

    test('should route publishBinary through transport.publish', () => {
      const ws = createMockWs();
      const transport = createLegacyMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      const buffer = new ArrayBuffer(8);

      socket.publishBinary('room-1', buffer);

      expect(transport.publish).toHaveBeenCalledWith('chat.room-1', buffer);
      expect(ws.publishBinary).not.toHaveBeenCalled();
    });
  });

  describe('send methods - should NOT use transport', () => {
    test('send() always uses ws.send regardless of transport', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.send('direct message');

      expect(ws.send).toHaveBeenCalledWith('direct message', undefined);
      expect(transport.publish).not.toHaveBeenCalled();
    });

    test('sendText() always uses ws.sendText regardless of transport', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.sendText('text message');

      expect(ws.sendText).toHaveBeenCalledWith('text message', undefined);
      expect(transport.publish).not.toHaveBeenCalled();
    });

    test('sendBinary() always uses ws.sendBinary regardless of transport', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      const buffer = new ArrayBuffer(4);

      socket.sendBinary(buffer);

      expect(ws.sendBinary).toHaveBeenCalledWith(buffer, undefined);
      expect(transport.publish).not.toHaveBeenCalled();
    });
  });

  describe('subscribe/unsubscribe - should NOT use transport', () => {
    test('subscribe() always uses ws.subscribe (local Bun)', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.subscribe('room-1');

      expect(ws.subscribe).toHaveBeenCalledWith('chat.room-1');
      expect(transport.publish).not.toHaveBeenCalled();
    });

    test('unsubscribe() always uses ws.unsubscribe (local Bun)', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.unsubscribe('room-1');

      expect(ws.unsubscribe).toHaveBeenCalledWith('chat.room-1');
      expect(transport.publish).not.toHaveBeenCalled();
    });
  });

  describe('property accessors', () => {
    test('should expose socket properties correctly', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat');

      expect(socket.id).toBe('socket-1');
      expect(socket.namespace).toBe('chat');
      expect(socket.remoteAddress).toBe('127.0.0.1');
      expect(socket.readyState).toBe(1);
      expect(socket.data).toBeDefined();
      expect(socket.data.id).toBe('socket-1');
    });

    test('should allow setting mutable properties', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat');

      socket.id = 'new-id';
      expect(socket.id).toBe('new-id');

      socket.remoteAddress = '192.168.1.1';
      expect(socket.remoteAddress).toBe('192.168.1.1');

      socket.readyState = 3;
      expect(socket.readyState).toBe(3);

      socket.binaryType = 'uint8array';
      expect(socket.binaryType).toBe('uint8array');
    });

    test('isSubscribed() should delegate to ws', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat');

      socket.isSubscribed('room-1');

      expect(ws.isSubscribed).toHaveBeenCalledWith('chat.room-1');
    });

    test('cork() should delegate to ws', () => {
      const ws = createMockWs();
      ws.cork = mock((cb: any) => cb(ws));
      const socket = new AsenaSocket(ws, 'chat');

      socket.cork(() => 'result' as any);

      expect(ws.cork).toHaveBeenCalled();
    });

    test('getBufferedAmount() should delegate to ws', () => {
      const ws = createMockWs();
      ws.getBufferedAmount = mock(() => 42);
      const socket = new AsenaSocket(ws, 'chat');

      expect(socket.getBufferedAmount()).toBe(42);
    });
  });
});
