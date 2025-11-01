import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Socket } from '../../../lib/server/web/websocket';
import { AsenaWebSocketService } from '../../../lib/server/web/websocket';

describe('AsenaWebSocketService', () => {
  let service: AsenaWebSocketService<any>;
  let mockSocket: Socket<any>;

  beforeEach(() => {
    service = new AsenaWebSocketService();
    service.server = {
      to: mock(() => {}),
    } as any;

    mockSocket = {
      id: 'test-socket-id',
      data: { id: 'test-user-id' },
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
    } as any;
  });

  test('in() method sends data to all connected clients', () => {
    const testData = { message: 'test' };

    service.namespace = 'base';

    service.in(testData);

    expect(service.server.to).toHaveBeenCalledWith('base.__', testData);
  });

  test('to() method sends data to a specific namespace', () => {
    const namespace = 'test-room';
    const testData = { message: 'test' };

    service.namespace = 'base';

    service.to(namespace, testData);

    expect(service.server.to).toHaveBeenCalledWith('base.test-room', testData);
  });

  test('to() method sends data to a specific namespace', () => {
    const testData = { message: 'test' };

    service.namespace = 'base';

    service.to(null, testData);

    expect(service.server.to).toHaveBeenCalledWith('base', testData);
  });

  test('to() method throws error for invalid namespace', () => {
    // @ts-ignore
    expect(() => service.to({ test: 'hello' })).toThrow('Namespace must be a string');
  });

  test('onOpenInternal() registers new socket connection', async () => {
    await service['onOpenInternal'](mockSocket);

    expect(service.sockets.get(mockSocket.id)).toBe(mockSocket);
    expect(mockSocket.subscribe).toHaveBeenCalledTimes(2);
    expect(mockSocket.subscribe).toHaveBeenCalledWith('__');
    expect(mockSocket.subscribe).toHaveBeenCalledWith(mockSocket.data.id);
  });

  test('onCloseInternal() cleans up socket connection', async () => {
    service.sockets.set(mockSocket.id, mockSocket);

    await service['onCloseInternal'](mockSocket, 1000, 'test');

    expect(service.sockets.has(mockSocket.id)).toBe(false);
    expect(mockSocket.unsubscribe).toHaveBeenCalledTimes(2);
  });

  test('sockets getter returns the sockets', () => {
    const sockets = service.sockets;

    sockets.set(mockSocket.id, mockSocket);

    expect(sockets).toBeDefined();
    expect(sockets.size).toBe(1);
  });

  test('should not have memory leak with multiple connect/disconnect cycles', async () => {
    const initialSocketCount = service.sockets.size;

    // Simulate multiple connect/disconnect cycles
    for (let i = 0; i < 100; i++) {
      const tempSocket = {
        id: `socket-${i}`,
        data: { id: `user-${i}` },
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
      } as any;

      // Simulate connection
      await service['onOpenInternal'](tempSocket);

      // Simulate disconnection
      await service['onCloseInternal'](tempSocket, 1000, 'test');
    }

    // After all connections are closed, counts should return to initial state
    expect(service.sockets.size).toBe(initialSocketCount);
  });

  test('onCloseInternal() properly unsubscribes with correct topic format', async () => {
    // This test specifically verifies the bug fix for Issue #2
    await service['onOpenInternal'](mockSocket);

    // Verify subscriptions were called with correct format
    expect(mockSocket.subscribe).toHaveBeenCalledWith('__');
    expect(mockSocket.subscribe).toHaveBeenCalledWith(mockSocket.data.id); // No leading dot

    // Clear previous calls
    (mockSocket.unsubscribe as any).mockClear();

    await service['onCloseInternal'](mockSocket, 1000, 'test');

    // Verify unsubscriptions are called with matching format (no leading dot)
    expect(mockSocket.unsubscribe).toHaveBeenCalledWith('__');
    expect(mockSocket.unsubscribe).toHaveBeenCalledWith(mockSocket.data.id); // Should match subscribe format
  });
});
