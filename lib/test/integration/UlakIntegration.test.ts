import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import 'reflect-metadata';
import { Ulak } from '../../server/messaging/Ulak';
import { PrepareWebsocketService } from '../../server/src/services/PrepareWebsocketService';
import type { AsenaSocket } from '../../server/web/websocket';
import { AsenaWebSocketService } from '../../server/web/websocket';
import type { ServerLogger } from '../../logger';
import type { Container } from '../../ioc/Container';
import { ComponentConstants } from '../../ioc';

/**
 * Integration tests for Ulak WebSocket Messaging System
 * Tests the full integration between Ulak, PrepareWebsocketService, and WebSocket services
 */
describe('Ulak Integration Tests', () => {
  let ulak: Ulak;
  let prepareWebsocketService: PrepareWebsocketService;
  let mockLogger: ServerLogger;
  let mockContainer: Container;
  let chatWebSocket: ChatWebSocket;
  let notificationsWebSocket: NotificationsWebSocket;

  beforeEach(async () => {
    // Mock logger
    mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    } as any;

    // Create Ulak instance
    ulak = new Ulak();
    (ulak as any).logger = mockLogger;
    (ulak as any).serviceName = '__Ulak__';
    await ulak.init();

    // Create WebSocket service instances ONCE
    chatWebSocket = new ChatWebSocket();
    notificationsWebSocket = new NotificationsWebSocket();

    // Set decorator metadata manually (simulating @WebSocket decorator)
    // Note: WebSocket decorator removes leading '/' from path
    Reflect.defineMetadata(ComponentConstants.PathKey, 'chat', ChatWebSocket);
    Reflect.defineMetadata(ComponentConstants.PathKey, 'notifications', NotificationsWebSocket);

    // Mock container that returns the SAME instances
    mockContainer = {
      resolveAll: mock(async (type: string) => {
        if (type === 'WEBSOCKET') {
          // ComponentType.WEBSOCKET = 'WEBSOCKET'
          return [chatWebSocket, notificationsWebSocket];
        }

        return [];
      }),
    } as any;

    // Create PrepareWebsocketService
    prepareWebsocketService = new PrepareWebsocketService();
    (prepareWebsocketService as any).container = mockContainer;
    (prepareWebsocketService as any).ulak = ulak;
    (prepareWebsocketService as any).serviceName = 'PrepareWebsocketService';
  });

  afterEach(() => {
    ulak.dispose();
  });

  describe('PrepareWebsocketService + Ulak Integration', () => {
    test('should register WebSocket services to Ulak during prepare', async () => {
      const services = await prepareWebsocketService.prepare();

      // Verify services were registered
      expect(services.length).toBe(2);
      expect(services).toContain(chatWebSocket);
      expect(services).toContain(notificationsWebSocket);

      // Verify namespace property was set (decorator removes leading '/')
      expect(chatWebSocket.namespace).toBe('chat');
      expect(notificationsWebSocket.namespace).toBe('notifications');

      // Verify Ulak has the namespaces
      expect(ulak.hasNamespace('/chat')).toBe(true);
      expect(ulak.hasNamespace('/notifications')).toBe(true);

      const namespaces = ulak.getNamespaces();

      expect(namespaces).toContain('/chat');
      expect(namespaces).toContain('/notifications');
    });

    test('should allow broadcasting via Ulak after registration', async () => {
      await prepareWebsocketService.prepare();

      // Mock the service's in() method
      chatWebSocket.in = mock(() => {});

      // Broadcast via Ulak
      await ulak.broadcast('/chat', { message: 'Hello Chat!' });

      expect(chatWebSocket.in).toHaveBeenCalledWith({ message: 'Hello Chat!' });
    });

    test('should allow sending to room via Ulak after registration', async () => {
      await prepareWebsocketService.prepare();

      // Mock the service's to() method
      chatWebSocket.to = mock(() => {});

      // Send to room via Ulak
      await ulak.to('/chat', 'room-1', { message: 'Room message' });

      expect(chatWebSocket.to).toHaveBeenCalledWith('room-1', { message: 'Room message' });
    });
  });

  describe('Scoped Namespace Usage', () => {
    test('should work with scoped namespace pattern', async () => {
      await prepareWebsocketService.prepare();

      const chat = ulak.namespace('/chat');

      expect(chat.path).toBe('/chat');
      expect(chat.getSocketCount()).toBe(0);

      chatWebSocket.in = mock(() => {});

      await chat.broadcast({ type: 'announcement', text: 'System message' });

      expect(chatWebSocket.in).toHaveBeenCalledWith({ type: 'announcement', text: 'System message' });
    });

    test('should support multiple scoped namespaces', async () => {
      await prepareWebsocketService.prepare();

      const chat = ulak.namespace('/chat');
      const notifications = ulak.namespace('/notifications');

      expect(chat.path).toBe('/chat');
      expect(notifications.path).toBe('/notifications');

      chatWebSocket.in = mock(() => {});
      notificationsWebSocket.in = mock(() => {});

      await chat.broadcast({ message: 'Chat broadcast' });
      await notifications.broadcast({ message: 'Notification broadcast' });

      expect(chatWebSocket.in).toHaveBeenCalledWith({ message: 'Chat broadcast' });
      expect(notificationsWebSocket.in).toHaveBeenCalledWith({ message: 'Notification broadcast' });
    });
  });

  describe('Error Handling', () => {
    test('should throw error when broadcasting to non-existent namespace', async () => {
      await prepareWebsocketService.prepare();

      try {
        await ulak.broadcast('/non-existent', { message: 'test' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Namespace "/non-existent" not found');
        expect(error.code).toBe('NAMESPACE_NOT_FOUND');
      }
    });

    test('should throw error when sending to room in non-existent namespace', async () => {
      await prepareWebsocketService.prepare();

      try {
        await ulak.to('/non-existent', 'room-1', { message: 'test' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Namespace "/non-existent" not found');
        expect(error.code).toBe('NAMESPACE_NOT_FOUND');
      }
    });
  });

  describe('Cleanup', () => {
    test('should unregister namespace correctly', async () => {
      await prepareWebsocketService.prepare();

      expect(ulak.hasNamespace('/chat')).toBe(true);

      ulak.unregisterNamespace('/chat');

      expect(ulak.hasNamespace('/chat')).toBe(false);
      expect(ulak.getNamespaces()).not.toContain('/chat');
    });

    test('should dispose all resources', async () => {
      await prepareWebsocketService.prepare();

      expect(ulak.getNamespaces().length).toBe(2);

      ulak.dispose();

      expect(ulak.getNamespaces().length).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('[Ulak] Disposed');
    });
  });
});

// Mock WebSocket services for testing
class ChatWebSocket extends AsenaWebSocketService<{ userId: string }> {

  protected async onOpen(_socket: AsenaSocket<{ userId: string }>) {
    // Mock implementation
  }

  protected async onMessage(_socket: AsenaSocket<{ userId: string }>, _message: Buffer | string) {
    // Mock implementation
  }

}

class NotificationsWebSocket extends AsenaWebSocketService<{ userId: string }> {

  protected async onOpen(_socket: AsenaSocket<{ userId: string }>) {
    // Mock implementation
  }

  protected async onMessage(_socket: AsenaSocket<{ userId: string }>, _message: Buffer | string) {
    // Mock implementation
  }

}
