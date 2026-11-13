import { afterEach, describe, expect, test } from 'bun:test';
import { AsenaSocket, type WebSocketData } from '../../../lib/server/web/websocket';

type BinaryType = NonNullable<AsenaSocket<unknown>['binaryType']>;

describe('AsenaSocket.binaryType on a real Bun socket', () => {
  let server: Bun.Server<any> | undefined;
  let client: WebSocket | undefined;

  afterEach(() => {
    client?.close();
    server?.stop(true);
    client = undefined;
    server = undefined;
  });

  /** Delivers one binary frame to a socket configured by `configure`, and returns what the server received. */
  const deliverBinaryFrame = async (configure: (socket: AsenaSocket<unknown>) => void): Promise<unknown> => {
    const received = Promise.withResolvers<unknown>();

    server = Bun.serve({
      port: 10000 + Math.floor(Math.random() * 22000),
      fetch: (request, bunServer) =>
        bunServer.upgrade(request, { data: { id: 'socket-1', path: 'files', values: {} } })
          ? undefined
          : new Response('upgrade failed', { status: 400 }),
      websocket: {
        data: {} as WebSocketData<unknown>,
        open: (ws) => configure(new AsenaSocket<unknown>(ws, 'files')),
        message: (_ws, message) => received.resolve(message),
      },
    });

    client = new WebSocket(`ws://localhost:${server.port}`);
    await new Promise((resolve) => (client!.onopen = resolve));
    client.send(new Uint8Array([1, 2, 3]));

    return received.promise;
  };

  test.each<[BinaryType, (message: unknown) => boolean]>([
    ['arraybuffer', (message) => message instanceof ArrayBuffer],
    ['uint8array', (message) => message instanceof Uint8Array && !Buffer.isBuffer(message)],
    ['nodebuffer', (message) => Buffer.isBuffer(message)],
    ['blob', (message) => message instanceof Blob],
  ])('setting %s changes what the socket delivers', async (binaryType, isExpected) => {
    const message = await deliverBinaryFrame((socket) => {
      socket.binaryType = binaryType;
      expect(socket.binaryType).toBe(binaryType);
    });

    expect(isExpected(message)).toBe(true);
  });

  test('a value Bun rejects throws and leaves the getter on the previous value', async () => {
    let previous: BinaryType | undefined;
    let current: BinaryType | undefined;
    let thrown: unknown;

    await deliverBinaryFrame((socket) => {
      previous = socket.binaryType;

      try {
        socket.binaryType = 'bogus' as BinaryType;
      } catch (error) {
        thrown = error;
      }

      current = socket.binaryType;
    });

    expect(thrown).toBeInstanceOf(Error);
    expect(current).toBe(previous!);
  });
});
