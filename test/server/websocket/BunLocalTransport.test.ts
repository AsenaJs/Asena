import { describe, expect, mock, test } from 'bun:test';
import { BunLocalTransport } from '../../../lib/server/web/websocket';

describe('BunLocalTransport', () => {
  test('should store server reference on init', async () => {
    const mockServer: any = { publish: mock(() => {}) };
    const transport = new BunLocalTransport();

    await transport.init(mockServer);

    transport.publish('topic', 'data');

    expect(mockServer.publish).toHaveBeenCalledTimes(1);
  });

  test('should delegate publish with string data to server.publish', async () => {
    const mockServer: any = { publish: mock(() => {}) };
    const transport = new BunLocalTransport();

    await transport.init(mockServer);

    transport.publish('chat.room-1', 'hello');

    expect(mockServer.publish).toHaveBeenCalledWith('chat.room-1', 'hello');
  });

  test('should delegate publish with ArrayBuffer to server.publish', async () => {
    const mockServer: any = { publish: mock(() => {}) };
    const transport = new BunLocalTransport();

    await transport.init(mockServer);

    const buffer = new ArrayBuffer(8);

    transport.publish('chat.room-1', buffer);

    expect(mockServer.publish).toHaveBeenCalledWith('chat.room-1', buffer);
  });

  test('should throw when publish called before init', () => {
    const transport = new BunLocalTransport();

    expect(() => transport.publish('topic', 'data')).toThrow();
  });

  test('should not have destroy method requirement', async () => {
    const transport = new BunLocalTransport();

    // destroy is optional in the interface - BunLocalTransport doesn't implement it
    // Just verify it doesn't break anything
    expect(transport.destroy).toBeUndefined();
  });
});
