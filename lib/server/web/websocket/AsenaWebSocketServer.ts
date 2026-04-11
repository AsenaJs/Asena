import type { WebSocketTransport } from './WebSocketTransport';

/**
 * AsenaWebSocketServer class handles WebSocket server operations and message broadcasting
 *
 * This class provides a thin wrapper around the WebSocket transport layer.
 * All WebSocket services share a single instance of this wrapper for efficiency.
 */
export class AsenaWebSocketServer {
  /**
   * The transport layer used for publishing messages
   * @private
   */
  private transport: WebSocketTransport;

  /**
   * Creates a new instance of AsenaWebSocketServer
   *
   * @param transport - The WebSocket transport to use for publishing
   */
  public constructor(transport: WebSocketTransport) {
    this.transport = transport;
  }

  /**
   * Publishes data to a specific namespace
   *
   * @param nameSpace - The target namespace to publish to
   * @param data - The data to publish. Supports ArrayBuffer, objects, strings, and numbers
   */
  public to(nameSpace: string, data?: any) {
    if (data instanceof ArrayBuffer || data instanceof DataView) {
      this.transport.publish(nameSpace, data);
      return;
    }

    if ((typeof data === 'object' || typeof data === 'string') && data !== null) {
      this.transport.publish(nameSpace, JSON.stringify(data));
    } else if (typeof data === 'number' || data === null || data === undefined) {
      this.transport.publish(nameSpace, String(data));
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
