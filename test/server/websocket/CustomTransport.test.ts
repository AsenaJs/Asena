import { describe, expect, mock, test } from 'bun:test';
import { AsenaWebSocketServer, AsenaSocket } from '../../../lib/server/web/websocket';
import type { WebSocketTransport } from '../../../lib/server/web/websocket';
import type { Server } from 'bun';

/**
 * Mock Redis-like transport for testing.
 * Tracks all operations for verification.
 */
class MockRedisTransport implements WebSocketTransport {
  public initCalled = false;
  public destroyCalled = false;
  public serverRef: Server<any> | null = null;
  public published: { topic: string; data: any }[] = [];

  public async init(server: Server<any>): Promise<void> {
    this.initCalled = true;
    this.serverRef = server;
  }

  public publish(topic: string, data: string | ArrayBuffer | ArrayBufferView): void {
    this.published.push({ topic, data });
    // In real Redis transport, this would also call:
    // this.serverRef.publish(topic, data) for local delivery
    // this.redis.publish(topic, { data, origin: podId }) for remote delivery
  }

  public async destroy(): Promise<void> {
    this.destroyCalled = true;
  }
}

describe('Custom Transport Integration', () => {
  test('init(server) should be called with server reference', async () => {
    const transport = new MockRedisTransport();
    const mockServer: any = { publish: mock(() => {}) };

    await transport.init(mockServer);

    expect(transport.initCalled).toBe(true);
    expect(transport.serverRef).toBe(mockServer);
  });

  test('AsenaWebSocketServer should use custom transport for publishing', () => {
    const transport = new MockRedisTransport();
    const server = new AsenaWebSocketServer(transport);

    server.to('chat.room-1', { message: 'hello' });
    server.to('chat.__', 'broadcast');

    expect(transport.published).toHaveLength(2);
    expect(transport.published[0].topic).toBe('chat.room-1');
    expect(transport.published[0].data).toBe(JSON.stringify({ message: 'hello' }));
    expect(transport.published[1].topic).toBe('chat.__');
    expect(transport.published[1].data).toBe(JSON.stringify('broadcast'));
  });

  test('AsenaSocket should use custom transport for publish operations', () => {
    const transport = new MockRedisTransport();
    const mockWs: any = {
      data: { id: 'sock-1', path: 'chat', values: {} },
      send: mock(() => 0),
      publish: mock(() => 0),
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
      remoteAddress: '127.0.0.1',
      readyState: 1,
      binaryType: 'arraybuffer',
      subscriptions: [],
    };

    const socket = new AsenaSocket(mockWs, 'chat', transport);

    socket.publish('room-1', 'hello from socket');

    expect(transport.published).toHaveLength(1);
    expect(transport.published[0].topic).toBe('chat.room-1');
    expect(transport.published[0].data).toBe('hello from socket');
    // ws.publish should NOT be called
    expect(mockWs.publish).not.toHaveBeenCalled();
  });

  test('AsenaSocket send() should NOT go through custom transport', () => {
    const transport = new MockRedisTransport();
    const mockWs: any = {
      data: { id: 'sock-1', path: 'chat', values: {} },
      send: mock(() => 0),
      publish: mock(() => 0),
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
      remoteAddress: '127.0.0.1',
      readyState: 1,
      binaryType: 'arraybuffer',
      subscriptions: [],
    };

    const socket = new AsenaSocket(mockWs, 'chat', transport);

    socket.send('direct message');

    expect(mockWs.send).toHaveBeenCalledWith('direct message', undefined);
    expect(transport.published).toHaveLength(0);
  });

  test('destroy() should be called for cleanup', async () => {
    const transport = new MockRedisTransport();

    await transport.destroy();

    expect(transport.destroyCalled).toBe(true);
  });
});