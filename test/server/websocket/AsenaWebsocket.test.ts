import { afterEach, beforeEach, describe, expect, it, jest, mock, test } from 'bun:test';
import type { AsenaWebSocketServer } from '../../../lib/server/web/websocket';
import { AsenaSocket, AsenaWebSocketService, type Socket } from '../../../lib/server/web/websocket';

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

      expect(wsService.sockets.size).toBe(1);

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

      const rooms = wsService.rooms;

      expect(rooms.has('test-room')).toBe(true);

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

    it('should remove socket from all rooms, if socket disconnects', async () => {
      const mockWs = new AsenaSocket(
        {
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          data: { id: 'test-socket-id' },
        } as any,
        wsService,
      );

      wsService.rooms.set('test-room-hidden', [mockWs]);

      mockWs.subscribe('test-room');

      // @ts-ignore
      await wsService.onCloseInternal(mockWs, 1000, 'test close');

      const roomSockets = wsService.getSocketsByRoom('test-room');
      const hiddenRoomSockets = wsService.getSocketsByRoom('test-room-hidden');

      expect(wsService.rooms.size).toBe(0);
      expect(wsService.sockets.size).toBe(0);

      expect(roomSockets).toBeUndefined();
      expect(hiddenRoomSockets).toBeUndefined();
    });
  });

  describe('Websocket send tests', () => {
    let mockWs: AsenaSocket<any>;

    // eslint-disable-next-line max-nested-callbacks
    beforeEach(() => {
      mockWs = new AsenaSocket(
        {
          send: jest.fn().mockReturnValue(1),
          sendText: jest.fn().mockReturnValue(1),
          sendBinary: jest.fn().mockReturnValue(1),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          data: { id: 'test-socket-id' },
        } as any,
        wsService,
      );
    });

    it('should call ws send with string data', () => {
      const testData = 'test message';
      const result = mockWs.send(testData);

      expect(mockWs['ws'].send).toHaveBeenCalledWith(testData, undefined);
      expect(result).toBe(1);
    });

    it('should call ws send with binary data', () => {
      const testData = new Uint8Array([1, 2, 3]).buffer;
      const result = mockWs.send(testData, true);

      expect(mockWs['ws'].send).toHaveBeenCalledWith(testData, true);
      expect(result).toBe(1);
    });

    it('should call ws sendText', () => {
      const testData = 'test message';
      const result = mockWs.sendText(testData, true);

      expect(mockWs['ws'].sendText).toHaveBeenCalledWith(testData, true);
      expect(result).toBe(1);
    });

    it('should call ws sendBinary', () => {
      const testData = new Uint8Array([1, 2, 3]).buffer;
      const result = mockWs.sendBinary(testData, true);

      expect(mockWs['ws'].sendBinary).toHaveBeenCalledWith(testData, true);
      expect(result).toBe(1);
    });
  });

  describe('Websocket close and terminate tests', () => {
    let mockWs: AsenaSocket<any>;

    beforeEach(() => {
      mockWs = new AsenaSocket(
        {
          close: jest.fn().mockReturnValue(1),
          terminate: jest.fn().mockReturnValue(1),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          data: { id: 'test-socket-id' },
        } as any,
        wsService,
      );

      global.spy = {
        // eslint-disable-next-line max-nested-callbacks
        close: mock(() => 1),
        // eslint-disable-next-line max-nested-callbacks
        terminate: mock(() => 1),
        // eslint-disable-next-line max-nested-callbacks
        cleanup: mock(() => 1),
      };

      mockWs['ws'].close = global.spy.close;
      mockWs['ws'].terminate = global.spy.terminate;
      mockWs.cleanup = global.spy.cleanup;
    });

    it('should call ws close with code and reason', () => {
      const code = 1000;
      const reason = 'normal closure';

      mockWs.close(code, reason);

      expect(global.spy.close).toHaveBeenCalledWith(code, reason);
      expect(global.spy.cleanup).toHaveBeenCalled();
    });

    it('should call ws close without parameters', () => {
      mockWs.close();

      expect(global.spy.close).toHaveBeenCalledWith(undefined, undefined);
      expect(global.spy.cleanup).toHaveBeenCalled();
    });

    it('should call ws end (terminate)', () => {
      mockWs.terminate();

      expect(global.spy.terminate).toHaveBeenCalled();
      expect(global.spy.cleanup).toHaveBeenCalled();
    });
  });

  describe('Ping-Pong Tests', () => {
    let mockSocket: Socket<any>;

    beforeEach(() => {
      mockSocket = new AsenaSocket(
        {
          ping: jest.fn(),
          pong: jest.fn(),
          data: { id: 'test-socket-id' },
        } as any,
        wsService,
      );
    });

    test('onPing() method handles ping event', () => {
      const testData = 'Data';

      mockSocket.ping(testData);

      expect(mockSocket['ws'].ping).toHaveBeenCalledWith(testData);
    });

    test('onPong() method handles ping event', () => {
      const testData = 'Data';

      mockSocket.pong(testData);

      expect(mockSocket['ws'].pong).toHaveBeenCalledWith(testData);
    });
  });
});
