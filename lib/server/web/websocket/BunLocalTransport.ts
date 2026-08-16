import type { Server } from 'bun';
import type { WebSocketData } from './types';
import type { WebSocketTransport } from './WebSocketTransport';

/**
 * Default WebSocket transport using Bun's native server.publish().
 *
 * Single-pod only - messages are delivered to local sockets via Bun's
 * built-in pub/sub mechanism. Zero overhead, no external dependencies.
 *
 * This is the default transport when no custom transport is configured.
 */
export class BunLocalTransport implements WebSocketTransport {
  private server: Server<WebSocketData>;

  public async init(server: Server<WebSocketData>): Promise<void> {
    this.server = server;
  }

  public publish(topic: string, data: string | ArrayBuffer | ArrayBufferView): void {
    this.server.publish(topic, data as string | ArrayBuffer);
  }

  /**
   * No-op: there is no other pod to reach.
   *
   * Declared rather than omitted, because omitting it is what marks a transport as legacy -
   * `AsenaSocket.publish()` would then route local delivery through `publish()` and include the
   * sender, which is the divergence this method exists to remove.
   */
  public publishRemote(_topic: string, _data: string | ArrayBuffer | ArrayBufferView): void {
    // Single-pod: nothing to forward.
  }
}
