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
}
