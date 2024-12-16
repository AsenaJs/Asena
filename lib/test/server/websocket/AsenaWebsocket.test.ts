import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { AsenaWebSocketService } from '../../../server/web/websocket';
import type { AsenaWebSocketServer } from '../../../server/web/websocket/AsenaWebSocketServer';
import { AsenaSocket } from '../../../server/web/websocket';

describe('WebSocket Tests', () => {
  let wsService: AsenaWebSocketService<any>;
  let mockServer: AsenaWebSocketServer;

  beforeEach(() => {
    // Create mock server
    mockServer = {
      to: jest.fn(),
      in: jest.fn(),
      websocketCount: 0,
    } as unknown as AsenaWebSocketServer;

    // Initialize WebSocket service
    wsService = new AsenaWebSocketService();
    wsService.server = mockServer;
    wsService.namespace = 'test-namespace';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Tests', () => {
    it('should open a new socket connection', async () => {
      const mockWs = {
        id: 'test-socket-id',
        data: { id: 'test-socket-id' },
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
      } as unknown as AsenaSocket<any>;

      // @ts-ignore
      await wsService.onOpenInternal(mockWs);

      expect(wsService.sockets.has('test-socket-id')).toBe(true);
      expect(mockWs.subscribe).toHaveBeenCalledTimes(2);
    });

    it('should close socket connection', async () => {
      const mockWs = {
        id: 'test-socket-id',
        data: { id: 'test-socket-id' },
        cleanup: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
      } as unknown as AsenaSocket<any>;

      wsService.sockets.set('test-socket-id', mockWs);

      // @ts-ignore
      await wsService.onCloseInternal(mockWs, 1000, 'test close');

      expect(wsService.sockets.has('test-socket-id')).toBe(false);
      expect(mockWs.cleanup).toHaveBeenCalled();
      expect(mockWs.unsubscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('Messaging Tests', () => {
    it('should send message to specific namespace', () => {
      const testData = { message: 'test message' };

      wsService.to('test-room', testData);

      expect(mockServer.to).toHaveBeenCalledWith('test-namespace.test-room', testData);
    });

    it('should broadcast message to all connections', () => {
      const testData = { message: 'broadcast message' };

      wsService.in(testData);

      expect(mockServer.to).toHaveBeenCalledWith('test-namespace.__', testData);
    });
  });

  describe('Room Tests', () => {
    it('should allow socket to join a room', () => {
      const mockWs = new AsenaSocket(
        {
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          data: { id: 'test-socket-id' },
        } as any,
        wsService,
      );

      mockWs.subscribe('test-room');

      const roomSockets = wsService.getSocketsByRoom('test-room');

      expect(roomSockets).toContain(mockWs);
    });

    it('should allow socket to leave a room', () => {
      const mockWs = new AsenaSocket(
        {
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          data: { id: 'test-socket-id' },
        } as any,
        wsService,
      );

      mockWs.subscribe('test-room');
      mockWs.unsubscribe('test-room');

      const roomSockets = wsService.getSocketsByRoom('test-room');

      expect(roomSockets).toBeUndefined();
    });
  });
});
