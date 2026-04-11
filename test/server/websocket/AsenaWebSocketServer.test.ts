import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaWebSocketServer, BunLocalTransport } from '../../../lib/server/web/websocket';
import type { WebSocketTransport } from '../../../lib/server/web/websocket';

describe('AsenaWebSocketServer', () => {
  describe('with mock transport', () => {
    let server: AsenaWebSocketServer;
    let mockTransport: WebSocketTransport;

    beforeEach(() => {
      mockTransport = {
        publish: mock(() => {}),
      };

      server = new AsenaWebSocketServer(mockTransport);
    });

    describe('to() method', () => {
      test('handles ArrayBuffer data correctly', () => {
        const buffer = new ArrayBuffer(8);

        server.to('test-namespace', buffer);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', buffer);
      });

      test('handles DataView data correctly', () => {
        const view = new DataView(new ArrayBuffer(8));

        server.to('test-namespace', view);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', view);
      });

      test('handles object data by converting to JSON string', () => {
        const data = { message: 'test' };

        server.to('test-namespace', data);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', JSON.stringify(data));
      });

      test('handles string data by converting to JSON string', () => {
        server.to('test-namespace', 'test message');

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', JSON.stringify('test message'));
      });

      test('handles number data by converting to string', () => {
        server.to('test-namespace', 42);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', '42');
      });

      test('handles null data by converting to string', () => {
        server.to('test-namespace', null);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', 'null');
      });

      test('handles undefined data by converting to string', () => {
        server.to('test-namespace', undefined);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', 'undefined');
      });
    });

    describe('in() method', () => {
      test('calls to() with same parameters', () => {
        const data = { message: 'test' };

        server.in('test-namespace', data);

        expect(mockTransport.publish).toHaveBeenCalledWith('test-namespace', JSON.stringify(data));
      });
    });
  });

  describe('with BunLocalTransport', () => {
    test('delegates to Bun server via BunLocalTransport', async () => {
      const mockBunServer: any = { publish: mock(() => {}) };
      const transport = new BunLocalTransport();

      await transport.init(mockBunServer);

      const server = new AsenaWebSocketServer(transport);

      server.to('ns', { hello: 'world' });

      expect(mockBunServer.publish).toHaveBeenCalledWith('ns', JSON.stringify({ hello: 'world' }));
    });
  });
});
