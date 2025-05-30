import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { AsenaWebSocketServer } from '../../../server/web/websocket';

describe('AsenaWebSocketServer', () => {
  let server: AsenaWebSocketServer;
  let mockBunServer: any;

  beforeEach(() => {
    // Create a mock Bun server with required methods
    mockBunServer = {
      publish: mock(() => {}),
      subscriberCount: mock(() => 5),
    };

    server = new AsenaWebSocketServer(mockBunServer, 'test-topic');
  });

  describe('to() method', () => {
    test('handles ArrayBuffer data correctly', () => {
      const buffer = new ArrayBuffer(8);

      server.to('test-namespace', buffer);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', buffer);
    });

    test('handles object data by converting to JSON string', () => {
      const data = { message: 'test' };

      server.to('test-namespace', data);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', JSON.stringify(data));
    });

    test('handles string data directly', () => {
      const data = 'test message';

      server.to('test-namespace', data);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', JSON.stringify(data));
    });

    test('handles number data by converting to string', () => {
      const data = 42;

      server.to('test-namespace', data);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', String(data));
    });

    test('handles null data by converting to string', () => {
      server.to('test-namespace', null);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', 'null');
    });

    test('handles undefined data by converting to string', () => {
      server.to('test-namespace', undefined);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', 'undefined');
    });
  });

  describe('in() method', () => {
    test('calls to() method with same parameters', () => {
      const data = { message: 'test' };

      server.in('test-namespace', data);

      expect(mockBunServer.publish).toHaveBeenCalledWith('test-namespace', JSON.stringify(data));
    });
  });

  describe('websocketCount getter', () => {
    test('returns correct subscriber count', () => {
      const count = server.websocketCount;

      expect(mockBunServer.subscriberCount).toHaveBeenCalledWith('test-topic');
      expect(count).toBe(5);
    });
  });
});
