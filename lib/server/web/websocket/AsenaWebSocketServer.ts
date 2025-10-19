import type { Server } from 'bun';

/**
 * AsenaWebSocketServer class handles WebSocket server operations and message broadcasting
 *
 * This class provides a thin wrapper around Bun's WebSocket Server implementation.
 * All WebSocket services share a single instance of this wrapper for efficiency.
 */
export class AsenaWebSocketServer {

  /**
   * The underlying Bun WebSocket server instance
   * @private
   */
  private server: Server<any>;

  /**
   * Creates a new instance of AsenaWebSocketServer
   *
   * @param server - The Bun Server instance to use
   */
  public constructor(server: Server<any>) {
    this.server = server;
  }

  /**
   * Publishes data to a specific namespace
   *
   * @param nameSpace - The target namespace to publish to
   * @param data - The data to publish. Supports ArrayBuffer, objects, strings, and numbers
   * @returns void
   */
  public to(nameSpace: string, data?: any) {
    if (data instanceof ArrayBuffer || data instanceof DataView || data instanceof SharedArrayBuffer) {
      this.server.publish(nameSpace, data);
      return;
    }

    if ((typeof data === 'object' || typeof data === 'string') && data !== null) {
      this.server.publish(nameSpace, JSON.stringify(data));
    } else if (typeof data === 'number' || data === null || data === undefined) {
      this.server.publish(nameSpace, String(data));
    }
  }

  /**
   * Alias for the 'to' method
   *
   * @param nameSpace - The target namespace to publish to
   * @param data - The data to publish
   */
  public in(nameSpace: string, data?: any) {
    this.to(nameSpace, data);
  }

}
