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

function createMockTransport(): WebSocketTransport & { publish: ReturnType<typeof mock> } {
  return {
    publish: mock(() => {}),
  };
}

describe('AsenaSocket - Transport Routing', () => {
  describe('publish with transport', () => {
    test('should route publish through transport when transport is set', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publish('room-1', 'hello');

      expect(transport.publish).toHaveBeenCalledWith('chat.room-1', 'hello');
      expect(ws.publish).not.toHaveBeenCalled();
    });

    test('should fallback to ws.publish when no transport', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat'); // no transport

      socket.publish('room-1', 'hello');

      expect(ws.publish).toHaveBeenCalledWith('chat.room-1', 'hello', undefined);
    });

    test('should route publishText through transport when transport is set', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      socket.publishText('room-1', 'hello text');

      expect(transport.publish).toHaveBeenCalledWith('chat.room-1', 'hello text');
      expect(ws.publishText).not.toHaveBeenCalled();
    });

    test('should fallback to ws.publishText when no transport', () => {
      const ws = createMockWs();
      const socket = new AsenaSocket(ws, 'chat');

      socket.publishText('room-1', 'hello text');

      expect(ws.publishText).toHaveBeenCalledWith('chat.room-1', 'hello text', undefined);
    });

    test('should route publishBinary through transport when transport is set', () => {
      const ws = createMockWs();
      const transport = createMockTransport();
      const socket = new AsenaSocket(ws, 'chat', transport);

      const buffer = new ArrayBuffer(8);

      socket.publishBinary('room-1', buffer);

      expect(transport.publish).toHaveBeenCalledWith('chat.room-1', buffer);
      expect(ws.publishBinary).not.toHaveBeenCalled();
    });

    test('should fallback to ws.publishBinary when no transport', () => {
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

      expect(transport.publish).toHaveBeenCalledWith('notifications.user-123', 'you have mail');
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