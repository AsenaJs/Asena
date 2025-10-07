import type { Server } from 'bun';

// TODO: this section needs to rework
/**
 * AsenaWebSocketServer class handles WebSocket server operations and message broadcasting
 *
 * This class provides a wrapper around Bun's WebSocket Server implementation with additional
 * functionality for managing topics and message publishing.
 */
export class AsenaWebSocketServer {

  /**
   * The underlying Bun WebSocket server instance
   * @private
   */
  private server: Server;

  /**
   * The topic identifier for this WebSocket server
   * @private
   * @readonly
   */
  private readonly topic: string;

  /**
   * Creates a new instance of AsenaWebSocketServer
   *
   * @param server - The Bun Server instance to use
   * @param topic - The topic identifier for this WebSocket server
   */
  public constructor(server: Server, topic: string) {
    this.server = server;
    this.topic = topic;
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

  /**
   * Gets the current number of WebSocket subscribers for this server's topic
   *
   * @returns The number of active WebSocket connections
   */
  public get websocketCount() {
    return this.server.subscriberCount(this.topic);
  }

}
