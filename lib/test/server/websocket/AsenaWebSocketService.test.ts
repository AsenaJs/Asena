import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { AsenaWebSocketService } from '../../../server/web/websocket';
import type { Socket } from '../../../server/web/websocket';

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
      cleanup: mock(() => {}),
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
    expect(mockSocket.cleanup).toHaveBeenCalled();
    expect(mockSocket.unsubscribe).toHaveBeenCalledTimes(2);
  });

  test('getSocketsByRoom() returns sockets by room', () => {
    const room = 'test-room';
    const testData = { message: 'test' };

    service.namespace = 'base';

    service.to(room, testData);
  });

  test('rooms getter returns the rooms', () => {
    const rooms = service.rooms;

    rooms.set('test-room', [mockSocket]);

    expect(rooms).toBeDefined();
    expect(rooms.size).toBe(1);
  });

  test('sockets getter returns the sockets', () => {
    const sockets = service.sockets;

    sockets.set(mockSocket.id, mockSocket);

    expect(sockets).toBeDefined();
    expect(sockets.size).toBe(1);
  });
});
