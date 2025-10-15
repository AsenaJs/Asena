import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrepareWebsocketService } from '../../../server/src/services/PrepareWebsocketService';
import { ComponentType } from '../../../ioc';
import { WebSocket } from '../../../server/decorators';
import { AsenaWebSocketService, type Socket } from '../../../server/web/websocket';

@WebSocket({ path: '/ws1', name: 'TestWebSocket' })
export class TestWebSocket extends AsenaWebSocketService<any> {

  public onMessage(ws: Socket, message: Buffer | string) {
    ws.publishText('room', message.toString());
  }

}

@WebSocket({ path: '/ws2', name: 'TestWebSocket2' })
export class TestWebSocket2 extends AsenaWebSocketService<any> {

  public onMessage(ws: Socket, message: Buffer | string) {
    ws.publishText('room', message.toString());
  }

}

@WebSocket({ path: '/ws2', name: 'TestWebSocket3' })
export class TestWebSocket3 extends AsenaWebSocketService<any> {

  public onMessage(ws: Socket, message: Buffer | string) {
    ws.publishText('room', message.toString());
  }

}

describe('PrepareWebsocketService', () => {
  let service: PrepareWebsocketService;
  let mockContainer: any;
  let mockLogger: any;
  let mockWebSocket1: TestWebSocket;
  let mockWebSocket2: TestWebSocket2;
  let mockWebSocketDuplicate: TestWebSocket3;

  beforeEach(() => {
    mockWebSocket1 = new TestWebSocket();
    mockWebSocket2 = new TestWebSocket2();
    mockWebSocketDuplicate = new TestWebSocket3();

    mockLogger = {
      info: mock(() => {}),
    };

    mockContainer = {
      resolveAll: mock(() => []),
    };

    service = new PrepareWebsocketService();
    // Manually inject dependencies for testing (field injection)
    (service as any)['container'] = mockContainer;
    (service as any)['logger'] = mockLogger;
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return undefined when no websockets found', async () => {
    mockContainer.resolveAll = mock(() => []);

    const result = await service.prepare();

    expect(result).toBeUndefined();
  });

  it('should throw error when duplicate websocket paths found', async () => {
    mockContainer.resolveAll = mock(() => [[mockWebSocket2, mockWebSocketDuplicate]]);

    expect(service.prepare()).rejects.toThrow('Duplicate WebSocket path found: ws2');
  });

  it('should correctly prepare websockets', async () => {
    mockContainer.resolveAll = mock(() => [[mockWebSocket1, mockWebSocket2]]);

    const result = await service.prepare();

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(mockWebSocket1);
    expect(result[1]).toBe(mockWebSocket2);
    expect(mockWebSocket1.namespace).toBe('ws1');
    expect(mockWebSocket2.namespace).toBe('ws2');
  });

  it('should resolve websockets from container with correct type', async () => {
    await service.prepare();

    expect(mockContainer.resolveAll).toHaveBeenCalledWith(ComponentType.WEBSOCKET);
  });

  it('should handle flat arrays of websockets', async () => {
    // İç içe array olması durumu
    mockContainer.resolveAll = mock(() => [[mockWebSocket1], [mockWebSocket2]]);

    const result = await service.prepare();

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(mockWebSocket1);
    expect(result[1]).toBe(mockWebSocket2);
  });
});
