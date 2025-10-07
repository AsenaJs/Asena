import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServer, AsenaServerFactory } from '../../server';
import { WebSocket } from '../../server/decorators';
import { AsenaWebSocketService, type Socket } from '../../server/web/websocket';
import { createMockAdapter } from '../utils/createMockContext';
import { CoreBootstrapPhase } from '../../ioc';

/**
 * @description Integration test for WebSocket functionality
 * Tests WebSocket handler registration and message handling
 */
describe('WebSocket Integration', () => {
  let server: AsenaServer<any>;
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
  });

  afterEach(async () => {
    // Clean up server if it exists
    if (server) {
      try {
        // await server.stop?.();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('should handle WebSocket connections', async () => {
    @WebSocket('/ws')
    class TestWebSocket extends AsenaWebSocketService<any> {

      public onOpen(ws: Socket<any>) {
        ws.send('connected');
        mockLogger?.info('WebSocket connection opened');
      }

      public onMessage(ws: Socket<any>, message: any) {
        mockLogger.info('Received message:', message);
        ws.send(`echo: ${message}`);
      }

      public onClose(_ws: Socket<any>, code: number, reason: string) {
        mockLogger.info(`WebSocket connection closed: ${code} - ${reason}`);
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestWebSocket],
    });

    await server.start();

    // Verify WebSocket is registered
    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer.currentPhase).toBe(CoreBootstrapPhase.SERVER_READY);

    // Test WebSocket connection
    const wsConnection = await mockAdapter.testWebSocket('/ws');

    expect(wsConnection).toBeDefined();

    // Test message handling
    const echoResponse = await wsConnection.send('test message');

    expect(echoResponse).toBe('echo: test message');
  });
});
