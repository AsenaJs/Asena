import { describe, expect, mock, test } from 'bun:test';
import { BunLocalTransport } from '../../../lib/server/web/websocket';
import type { WebSocketTransport } from '../../../lib/server/web/websocket';

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

  test('publishRemote should be a no-op that never touches server.publish', async () => {
    const mockServer: any = { publish: mock(() => {}) };
    const transport = new BunLocalTransport();

    await transport.init(mockServer);

    transport.publishRemote('chat.room-1', 'hello');

    // Publishing here would duplicate local delivery and put the message back on the sender.
    expect(mockServer.publish).not.toHaveBeenCalled();
  });

  test('publishRemote should be declared, not merely absent', () => {
    // Absence of this method is what marks a transport as legacy: AsenaSocket would then fall
    // back to publish() and include the sender. So the assertion is not redundant with the class.
    const transport: WebSocketTransport = new BunLocalTransport();

    expect(typeof transport.publishRemote).toBe('function');
  });

  test('should not have destroy method requirement', async () => {
    // Typed as the interface on purpose: `destroy` is declared optional there, so reading it
    // is a real property access. Reading it off the concrete class is a reference to a member
    // that does not exist, which yields `undefined` and makes toBeUndefined() pass for the
    // wrong reason - the assertion would keep passing even if the interface dropped `destroy`.
    const transport: WebSocketTransport = new BunLocalTransport();

    // destroy is optional in the interface - BunLocalTransport doesn't implement it
    // Just verify it doesn't break anything
    expect(transport.destroy).toBeUndefined();
  });
});
