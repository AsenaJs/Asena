import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Ulak } from '../../../server/messaging/Ulak';
import { UlakError, UlakErrorCode } from '../../../server/messaging/types';
import type { AsenaWebSocketService } from '../../../server/web/websocket';
import type { ServerLogger } from '../../../logger';

describe('Ulak', () => {
  let ulak: Ulak;
  let mockLogger: ServerLogger;
  let mockWebSocketService: AsenaWebSocketService<any>;
  let mockSocket: any;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    } as any;

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      send: mock(() => {}),
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
    };

    // Mock WebSocket service
    mockWebSocketService = {
      namespace: '/test',
      sockets: new Map([['socket-123', mockSocket]]),
      in: mock((data: any) => {}),
      to: mock((room: string, data: any) => {}),
      server: {} as any,
    } as any;

    // Create Ulak instance
    ulak = new Ulak();

    // Manually inject dependencies (since we're not using CoreContainer in tests)
    (ulak as any).logger = mockLogger;
    (ulak as any).serviceName = '__Ulak__';
  });

  afterEach(() => {
    // Clean up metrics interval
    ulak.dispose();
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await ulak.init();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing WebSocket messaging system ready'),
      );
    });
  });

  describe('registerNamespace()', () => {
    test('should register a new namespace', () => {
      ulak.registerNamespace('/test', mockWebSocketService);

      expect(ulak.hasNamespace('/test')).toBe(true);
      expect(ulak.getNamespaces()).toContain('/test');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Namespace "/test" registered'));
    });

    test('should warn when registering duplicate namespace', () => {
      ulak.registerNamespace('/test', mockWebSocketService);
      ulak.registerNamespace('/test', mockWebSocketService);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Namespace "/test" already registered, skipping'),
      );
    });
  });

  describe('unregisterNamespace()', () => {
    test('should unregister an existing namespace', () => {
      ulak.registerNamespace('/test', mockWebSocketService);
      ulak.unregisterNamespace('/test');

      expect(ulak.hasNamespace('/test')).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Namespace "/test" unregistered'));
    });

    test('should warn when unregistering non-existent namespace', () => {
      ulak.unregisterNamespace('/non-existent');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot unregister namespace "/non-existent" - not found'),
      );
    });
  });

  describe('broadcast()', () => {
    beforeEach(() => {
      ulak.registerNamespace('/test', mockWebSocketService);
    });

    test('should broadcast message to all clients in namespace', async () => {
      const data = { message: 'Hello everyone!' };

      await ulak.broadcast('/test', data);

      expect(mockWebSocketService.in).toHaveBeenCalledWith(data);
    });

    test('should throw UlakError when namespace not found', async () => {
      expect(async () => {
        await ulak.broadcast('/non-existent', { message: 'test' });
      }).toThrow(UlakError);

      try {
        await ulak.broadcast('/non-existent', { message: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
        expect((error as UlakError).code).toBe(UlakErrorCode.NAMESPACE_NOT_FOUND);
        expect((error as UlakError).namespace).toBe('/non-existent');
      }
    });

    test('should handle broadcast failure and log error', async () => {
      mockWebSocketService.in = mock(() => {
        throw new Error('Broadcast failed');
      });

      try {
        await ulak.broadcast('/test', { message: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
      }

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('to()', () => {
    beforeEach(() => {
      ulak.registerNamespace('/test', mockWebSocketService);
    });

    test('should send message to specific room', async () => {
      const data = { message: 'Room message' };

      await ulak.to('/test', 'room-1', data);

      expect(mockWebSocketService.to).toHaveBeenCalledWith('room-1', data);
    });

    test('should throw UlakError when namespace not found', async () => {
      try {
        await ulak.to('/non-existent', 'room-1', { message: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
        expect((error as UlakError).code).toBe(UlakErrorCode.NAMESPACE_NOT_FOUND);
      }
    });
  });

  describe('toSocket()', () => {
    beforeEach(() => {
      ulak.registerNamespace('/test', mockWebSocketService);
    });

    test('should send message to specific socket by ID', async () => {
      const data = { message: 'Direct message' };

      await ulak.toSocket('/test', 'socket-123', data);

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(data));
    });

    test('should send string data directly', async () => {
      await ulak.toSocket('/test', 'socket-123', 'plain text');

      expect(mockSocket.send).toHaveBeenCalledWith('plain text');
    });

    test('should throw UlakError when socket not found', async () => {
      try {
        await ulak.toSocket('/test', 'non-existent-socket', { message: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
        expect((error as UlakError).code).toBe(UlakErrorCode.SOCKET_NOT_FOUND);
        expect((error as UlakError).namespace).toBe('/test');
      }
    });

    test('should throw UlakError when namespace not found', async () => {
      try {
        await ulak.toSocket('/non-existent', 'socket-123', { message: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(UlakError);
        expect((error as UlakError).code).toBe(UlakErrorCode.NAMESPACE_NOT_FOUND);
      }
    });
  });

  describe('toMany()', () => {
    beforeEach(() => {
      ulak.registerNamespace('/test', mockWebSocketService);
    });

    test('should send to multiple rooms in parallel', async () => {
      const rooms = ['room-1', 'room-2', 'room-3'];
      const data = { message: 'Multi-room message' };

      await ulak.toMany('/test', rooms, data);

      expect(mockWebSocketService.to).toHaveBeenCalledTimes(3);
      expect(mockWebSocketService.to).toHaveBeenCalledWith('room-1', data);
      expect(mockWebSocketService.to).toHaveBeenCalledWith('room-2', data);
      expect(mockWebSocketService.to).toHaveBeenCalledWith('room-3', data);
    });

    test('should handle partial failures gracefully', async () => {
      let callCount = 0;

      mockWebSocketService.to = mock((room: string, data: any) => {
        callCount++;
        if (room === 'room-2') {
          throw new Error('Room 2 failed');
        }
      });

      const rooms = ['room-1', 'room-2', 'room-3'];

      await ulak.toMany('/test', rooms, { message: 'test' });

      expect(mockLogger.warn).toHaveBeenCalled();
      // Should still try all rooms despite failure
      expect(callCount).toBe(3);
    });
  });

  describe('broadcastAll()', () => {
    test('should broadcast to all registered namespaces', async () => {
      const mockService2 = {
        ...mockWebSocketService,
        namespace: '/test2',
        in: mock(() => {}),
      } as any;

      ulak.registerNamespace('/test', mockWebSocketService);
      ulak.registerNamespace('/test2', mockService2);

      const data = { message: 'Global announcement' };

      await ulak.broadcastAll(data);

      expect(mockWebSocketService.in).toHaveBeenCalledWith(data);
      expect(mockService2.in).toHaveBeenCalledWith(data);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Broadcast to all: 2 succeeded, 0 failed'));
    });

    test('should handle failures in some namespaces', async () => {
      const mockService2 = {
        ...mockWebSocketService,
        namespace: '/test2',
        in: mock(() => {
          throw new Error('Namespace 2 failed');
        }),
      } as any;

      ulak.registerNamespace('/test', mockWebSocketService);
      ulak.registerNamespace('/test2', mockService2);

      await ulak.broadcastAll({ message: 'test' });

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Broadcast to all: 1 succeeded, 1 failed'));
    });
  });

  describe('bulkSend()', () => {
    beforeEach(() => {
      ulak.registerNamespace('/test', mockWebSocketService);
    });

    test('should handle mixed bulk operations', async () => {
      const operations = [
        { type: 'broadcast' as const, namespace: '/test', data: { msg: '1' } },
        { type: 'room' as const, namespace: '/test', room: 'room-1', data: { msg: '2' } },
        { type: 'socket' as const, namespace: '/test', socketId: 'socket-123', data: { msg: '3' } },
      ];

      const result = await ulak.bulkSend(operations);

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockWebSocketService.in).toHaveBeenCalledWith({ msg: '1' });
      expect(mockWebSocketService.to).toHaveBeenCalledWith('room-1', { msg: '2' });
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ msg: '3' }));
    });

    test('should validate room operations', async () => {
      const operations = [
        { type: 'room' as const, namespace: '/test', data: { msg: 'test' } }, // Missing room
      ];

      const result = await ulak.bulkSend(operations);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
    });

    test('should validate socket operations', async () => {
      const operations = [
        { type: 'socket' as const, namespace: '/test', data: { msg: 'test' } }, // Missing socketId
      ];

      const result = await ulak.bulkSend(operations);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('namespace()', () => {
    beforeEach(() => {
      ulak.registerNamespace('/test', mockWebSocketService);
    });

    test('should return scoped namespace instance', () => {
      const scoped = ulak.namespace('/test');

      expect(scoped.path).toBe('/test');
      expect(typeof scoped.broadcast).toBe('function');
      expect(typeof scoped.to).toBe('function');
      expect(typeof scoped.toSocket).toBe('function');
    });

    test('scoped broadcast should call Ulak.broadcast', async () => {
      const scoped = ulak.namespace('/test');
      const data = { message: 'test' };

      await scoped.broadcast(data);

      expect(mockWebSocketService.in).toHaveBeenCalledWith(data);
    });

    test('scoped to should call Ulak.to', async () => {
      const scoped = ulak.namespace('/test');
      const data = { message: 'test' };

      await scoped.to('room-1', data);

      expect(mockWebSocketService.to).toHaveBeenCalledWith('room-1', data);
    });

    test('scoped toSocket should call Ulak.toSocket', async () => {
      const scoped = ulak.namespace('/test');
      const data = { message: 'test' };

      await scoped.toSocket('socket-123', data);

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(data));
    });

    test('scoped getSocketCount should return correct count', () => {
      const scoped = ulak.namespace('/test');

      expect(scoped.getSocketCount()).toBe(1);
    });
  });

  describe('getSocketCount()', () => {
    test('should return socket count for registered namespace', () => {
      ulak.registerNamespace('/test', mockWebSocketService);

      expect(ulak.getSocketCount('/test')).toBe(1);
    });

    test('should return 0 for non-existent namespace', () => {
      expect(ulak.getSocketCount('/non-existent')).toBe(0);
    });
  });

  describe('dispose()', () => {
    test('should clean up resources', () => {
      ulak.registerNamespace('/test', mockWebSocketService);

      ulak.dispose();

      expect(ulak.getNamespaces().length).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Disposed'));
    });
  });
});
