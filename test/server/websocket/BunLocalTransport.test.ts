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

    // There is no other pod to reach, and local delivery is the caller's ws.publish(). Publishing
    // here would duplicate the message locally and put it back on the socket that sent it.
    expect(mockServer.publish).not.toHaveBeenCalled();
  });

  test('publishRemote should be declared, not merely absent', () => {
    // What marks a transport as legacy is the *absence* of this method: AsenaSocket then falls
    // back to publish() for local delivery and includes the sender. Declaring it is how the
    // default transport opts into the sender-excluded path, so this is not a redundant assertion.
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
