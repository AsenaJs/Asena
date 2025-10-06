import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AsenaServerFactory } from '../../server/AsenaServerFactory';
import { AsenaServer } from '../../server/AsenaServer';
import { WebSocket } from '../../server/decorators';
import { AsenaWebSocketService, type Socket } from '../../server/web/websocket';
import { createMockAdapter } from '../utils/createMockContext';

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
        await server.stop?.();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('should handle WebSocket connections', async () => {
    @WebSocket('/ws')
    class TestWebSocket extends AsenaWebSocketService<any> {
      onOpen(ws: Socket<any>) {
        ws.send('connected');
        this.logger?.info('WebSocket connection opened');
      }

      onMessage(ws: Socket<any>, message: any) {
        this.logger?.info('Received message:', message);
        ws.send(`echo: ${message}`);
      }

      onClose(ws: Socket<any>, code: number, reason: string) {
        this.logger?.info(`WebSocket connection closed: ${code} - ${reason}`);
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [TestWebSocket]
    });

    await server.start();

    // Verify WebSocket is registered
    expect(server).toBeInstanceOf(AsenaServer);
    expect(server.coreContainer.currentPhase).toBe('SERVER_READY');

    // Test WebSocket connection
    const wsConnection = await mockAdapter.testWebSocket('/ws');
    expect(wsConnection).toBeDefined();

    // Test message handling
    const echoResponse = await wsConnection.send('test message');
    expect(echoResponse).toBe('echo: test message');
  });

  test('should handle multiple WebSocket namespaces', async () => {
    @WebSocket('/chat')
    class ChatWebSocket extends AsenaWebSocketService<any> {
      onOpen(ws: Socket<any>) {
        ws.send('chat connected');
      }

      onMessage(ws: Socket<any>, message: any) {
        ws.send(`chat: ${message}`);
      }
    }

    @WebSocket('/notifications')
    class NotificationWebSocket extends AsenaWebSocketService<any> {
      onOpen(ws: Socket<any>) {
        ws.send('notifications connected');
      }

      onMessage(ws: Socket<any>, message: any) {
        ws.send(`notification: ${message}`);
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [ChatWebSocket, NotificationWebSocket]
    });

    await server.start();

    // Test both WebSocket namespaces
    const chatWs = await mockAdapter.testWebSocket('/chat');
    const notificationWs = await mockAdapter.testWebSocket('/notifications');

    expect(chatWs).toBeDefined();
    expect(notificationWs).toBeDefined();

    // Test message handling for both
    const chatResponse = await chatWs.send('hello');
    expect(chatResponse).toBe('chat: hello');

    const notificationResponse = await notificationWs.send('alert');
    expect(notificationResponse).toBe('notification: alert');
  });

  test('should handle WebSocket with dependency injection', async () => {
    // Mock service for WebSocket
    class MessageService {
      formatMessage(message: string): string {
        return `[${new Date().toISOString()}] ${message}`;
      }

      validateMessage(message: string): boolean {
        return message && message.length > 0;
      }
    }

    @WebSocket('/messages')
    class MessageWebSocket extends AsenaWebSocketService<any> {
      private messageService: MessageService;

      constructor() {
        super();
        this.messageService = new MessageService();
      }

      onOpen(ws: Socket<any>) {
        ws.send('message service connected');
      }

      onMessage(ws: Socket<any>, message: any) {
        if (this.messageService.validateMessage(message)) {
          const formattedMessage = this.messageService.formatMessage(message);
          ws.send(formattedMessage);
        } else {
          ws.send('invalid message');
        }
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [MessageWebSocket]
    });

    await server.start();

    const wsConnection = await mockAdapter.testWebSocket('/messages');
    
    // Test valid message
    const validResponse = await wsConnection.send('test message');
    expect(validResponse).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] test message/);

    // Test invalid message
    const invalidResponse = await wsConnection.send('');
    expect(invalidResponse).toBe('invalid message');
  });

  test('should handle WebSocket connection lifecycle', async () => {
    const connectionEvents: string[] = [];

    @WebSocket('/lifecycle')
    class LifecycleWebSocket extends AsenaWebSocketService<any> {
      onOpen(ws: Socket<any>) {
        connectionEvents.push('opened');
        ws.send('connection opened');
      }

      onMessage(ws: Socket<any>, message: any) {
        connectionEvents.push('message received');
        ws.send(`received: ${message}`);
      }

      onClose(ws: Socket<any>, code: number, reason: string) {
        connectionEvents.push('closed');
      }

      onError(ws: Socket<any>, error: Error) {
        connectionEvents.push('error');
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [LifecycleWebSocket]
    });

    await server.start();

    const wsConnection = await mockAdapter.testWebSocket('/lifecycle');
    
    // Test connection
    expect(connectionEvents).toContain('opened');
    
    // Test message
    await wsConnection.send('test');
    expect(connectionEvents).toContain('message received');
    
    // Test close
    await wsConnection.close();
    expect(connectionEvents).toContain('closed');
  });

  test('should handle WebSocket with middleware', async () => {
    @WebSocket('/middleware')
    class MiddlewareWebSocket extends AsenaWebSocketService<any> {
      onOpen(ws: Socket<any>) {
        ws.send('middleware websocket connected');
      }

      onMessage(ws: Socket<any>, message: any) {
        // Simulate middleware processing
        const processedMessage = `processed: ${message}`;
        ws.send(processedMessage);
      }
    }

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [MiddlewareWebSocket]
    });

    await server.start();

    const wsConnection = await mockAdapter.testWebSocket('/middleware');
    
    const response = await wsConnection.send('test middleware');
    expect(response).toBe('processed: test middleware');
  });
});

