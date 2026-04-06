import type { Server } from 'bun';
import type { WebSocketData } from './types';

/**
 * Interface for WebSocket message transport.
 *
 * Abstracts the publish mechanism so WebSocket messages can be delivered
 * across multiple server instances (pods) via external message brokers
 * like Redis or NATS.
 *
 * The default implementation (BunLocalTransport) uses Bun's native
 * server.publish() for single-pod deployments with zero overhead.
 *
 * @example
 * ```typescript
 * // Custom Redis transport
 * class RedisTransport implements WebSocketTransport {
 *   private server: Server;
 *   private podId = crypto.randomUUID();
 *
 *   async init(server: Server) {
 *     this.server = server;
 *     // Subscribe to Redis for inbound messages from other pods
 *     this.redis.psubscribe('ws:*', (channel, message) => {
 *       const { data, origin } = JSON.parse(message);
 *       if (origin !== this.podId) {
 *         server.publish(channel.replace('ws:', ''), data);
 *       }
 *     });
 *   }
 *
 *   publish(topic: string, data: string | ArrayBuffer | ArrayBufferView) {
 *     // Local delivery
 *     this.server.publish(topic, data);
 *     // Remote delivery
 *     this.redis.publish(`ws:${topic}`, JSON.stringify({ data, origin: this.podId }));
 *   }
 *
 *   async destroy() {
 *     this.redis.punsubscribe('ws:*');
 *   }
 * }
 * ```
 */
export interface WebSocketTransport {
  /**
   * Publish data to a topic.
   *
   * Responsible for BOTH local and remote delivery:
   * - BunLocalTransport: server.publish() only (single-pod)
   * - Remote transports: server.publish() (local) + broker publish (remote)
   *
   * @param topic - The topic/channel to publish to (namespace-prefixed)
   * @param data - The data to publish
   */
  publish(topic: string, data: string | ArrayBuffer | ArrayBufferView): void;

  /**
   * Initialize transport with Bun server reference.
   *
   * Called during server startup, before any WebSocket connections are accepted.
   * Remote transports should:
   * 1. Store the server reference for local message delivery
   * 2. Subscribe to the message broker for inbound messages from other pods
   * 3. Relay inbound messages to local sockets via server.publish()
   *
   * @param server - The Bun server instance
   */
  init?(server: Server<WebSocketData>): Promise<void>;

  /**
   * Cleanup transport resources.
   *
   * Called during server shutdown. Remote transports should:
   * 1. Unsubscribe from message broker channels
   * 2. Close broker connections
   */
  destroy?(): Promise<void>;
}
