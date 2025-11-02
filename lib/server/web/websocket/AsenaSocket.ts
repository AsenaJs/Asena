import type { ServerWebSocket, ServerWebSocketSendStatus, WebSocketReadyState } from 'bun';
import type { WebSocketData } from './types';

/**
 * Wrapper class for Bun's ServerWebSocket that provides Asena-specific WebSocket functionality.
 * This class acts as a facade over the native Bun WebSocket implementation, adding features like
 * namespace-based topic management, room subscriptions, and automatic cleanup.
 *
 * @template T - Custom data type to be attached to the WebSocket connection
 *
 * @example
 * ```typescript
 * const socket = new AsenaSocket(ws, websocketService);
 * socket.subscribe('chat-room');
 * socket.publish('chat-room', 'Hello everyone!');
 * socket.unsubscribe('chat-room');
 * ```
 */
export class AsenaSocket<T> implements ServerWebSocket<WebSocketData<T>> {
  /**
   * The underlying Bun ServerWebSocket instance.
   * @private
   */
  private ws: ServerWebSocket<WebSocketData<T>>;

  /**
   * Cached remote IP address of the client.
   * @private
   */
  private _remoteAddress: string;

  /**
   * Cached WebSocket connection state.
   * @private
   */
  private _readyState: WebSocketReadyState;

  /**
   * Cached binary data type preference.
   * @private
   */
  private _binaryType?: 'nodebuffer' | 'arraybuffer' | 'uint8array';

  /**
   * Custom data attached to this WebSocket connection.
   * @private
   */
  private _data: WebSocketData<T>;

  /**
   * Unique identifier for this socket connection.
   * @private
   */
  private _id: string;

  /**
   * The namespace this socket belongs to.
   * @private
   */
  private _namespace: string;

  /**
   * Creates a new AsenaSocket instance wrapping a Bun ServerWebSocket.
   *
   * @param ws - The native Bun ServerWebSocket instance to wrap
   * @param namespace - The namespace this socket belongs to
   */
  public constructor(ws: ServerWebSocket<WebSocketData<T>>, namespace: string) {
    this.ws = ws;
    this._data = ws.data;
    this._id = ws.data.id;
    this._remoteAddress = ws.remoteAddress;
    this._binaryType = ws.binaryType;
    this._readyState = ws.readyState;
    this._namespace = namespace;
  }

  /**
   * Sends data to the client. Automatically detects whether data is text or binary.
   *
   * @param data - The data to send (string for text, ArrayBufferLike or DataView for binary)
   * @param compress - Whether to compress the data (default: false)
   * @returns The send status indicating success or failure
   */
  public send(data: string | ArrayBufferLike | DataView, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.send(data, compress);
  }

  /**
   * Sends text data to the client.
   *
   * @param data - The text string to send
   * @param compress - Whether to compress the data (default: false)
   * @returns The send status indicating success or failure
   */
  public sendText(data: string, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.sendText(data, compress);
  }

  /**
   * Sends binary data to the client.
   *
   * @param data - The binary data to send (ArrayBuffer, TypedArray, or DataView)
   * @param compress - Whether to compress the data (default: false)
   * @returns The send status indicating success or failure
   */
  public sendBinary(data: ArrayBufferLike | DataView, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.sendBinary(data, compress);
  }

  /**
   * Gracefully closes the WebSocket connection with an optional status code and reason.
   *
   * @param code - Optional WebSocket close code (default: 1000 for normal closure)
   * @param reason - Optional human-readable reason for closing
   */
  public close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  /**
   * Immediately terminates the WebSocket connection without sending a close frame.
   * Use this for forceful disconnections; prefer close() for graceful shutdowns.
   */
  public terminate(): void {
    this.ws.terminate();
  }

  /**
   * Sends a ping frame to the client to check connection liveness.
   * The client should respond with a pong frame.
   *
   * @param data - Optional data to include in the ping frame
   * @returns The send status indicating success or failure
   */
  public ping(data?: string | ArrayBufferLike | DataView): ServerWebSocketSendStatus {
    return this.ws.ping(data);
  }

  /**
   * Sends a pong frame to the client, typically in response to a ping.
   *
   * @param data - Optional data to include in the pong frame
   * @returns The send status indicating success or failure
   */
  public pong(data?: string | ArrayBufferLike | DataView): ServerWebSocketSendStatus {
    return this.ws.pong(data);
  }

  /**
   * Publishes data to all clients subscribed to the specified topic.
   * The topic is automatically prefixed with the namespace.
   *
   * @param topic - The topic name to publish to (will be prefixed with namespace)
   * @param data - The data to publish (string, ArrayBuffer, TypedArray, or DataView)
   * @param compress - Whether to compress the data (default: false)
   * @returns The send status indicating success or failure
   *
   * @example
   * ```typescript
   * socket.publish('chat-room', 'Hello everyone!');
   * ```
   */
  public publish(
    topic: string,
    data: string | ArrayBufferLike | DataView,
    compress?: boolean,
  ): ServerWebSocketSendStatus {
    return this.ws.publish(this.createTopic(topic), data, compress);
  }

  /**
   * Publishes text data to all clients subscribed to the specified topic.
   * The topic is automatically prefixed with the namespace.
   *
   * @param topic - The topic name to publish to (will be prefixed with namespace)
   * @param data - The text string to publish
   * @param compress - Whether to compress the data (default: false)
   * @returns The send status indicating success or failure
   */
  public publishText(topic: string, data: string, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.publishText(this.createTopic(topic), data, compress);
  }

  /**
   * Publishes binary data to all clients subscribed to the specified topic.
   * The topic is automatically prefixed with the namespace.
   *
   * @param topic - The topic name to publish to (will be prefixed with namespace)
   * @param data - The binary data to publish (ArrayBuffer, TypedArray, or DataView)
   * @param compress - Whether to compress the data (default: false)
   * @returns The send status indicating success or failure
   */
  public publishBinary(topic: string, data: ArrayBufferLike | DataView, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.publishBinary(this.createTopic(topic), data, compress);
  }

  /**
   * Subscribes this socket to a topic/room. Once subscribed, the socket will receive
   * all messages published to this topic. The topic is automatically prefixed with the namespace.
   *
   * @param topic - The topic/room name to subscribe to
   *
   * @example
   * ```typescript
   * socket.subscribe('notifications');
   * socket.subscribe('user-123-events');
   * ```
   */
  public subscribe(topic: string): void {
    this.ws.subscribe(this.createTopic(topic));
  }

  /**
   * Unsubscribes this socket from a topic/room. The socket will no longer receive
   * messages published to this topic. The topic is automatically prefixed with the namespace.
   *
   * @param topic - The topic/room name to unsubscribe from
   *
   * @example
   * ```typescript
   * socket.unsubscribe('notifications');
   * ```
   */
  public unsubscribe(topic: string): void {
    this.ws.unsubscribe(this.createTopic(topic));
  }

  /**
   * Checks if this socket is currently subscribed to a specific topic/room.
   * The topic is automatically prefixed with the namespace.
   *
   * @param topic - The topic/room name to check
   * @returns True if subscribed, false otherwise
   */
  public isSubscribed(topic: string): boolean {
    return this.ws.isSubscribed(this.createTopic(topic));
  }

  /**
   * Batches multiple send operations together for improved performance.
   * All socket operations within the callback will be buffered and sent together.
   * This is useful when sending multiple messages at once to reduce syscalls.
   *
   * @template T - The return type of the callback
   * @param callback - The function containing socket operations to batch
   * @returns The return value of the callback
   *
   * @example
   * ```typescript
   * socket.cork(() => {
   *   socket.send('message 1');
   *   socket.send('message 2');
   *   socket.send('message 3');
   *   return 'done';
   * });
   * ```
   */
  public cork<T = unknown>(callback: (ws: ServerWebSocket<T>) => T): T {
    return this.ws.cork(callback);
  }

  /**
   * Gets the remote IP address of the client.
   */
  public get remoteAddress(): string {
    return this._remoteAddress;
  }

  /**
   * Sets the remote IP address of the client.
   */
  public set remoteAddress(value: string) {
    this._remoteAddress = value;
  }

  /**
   * Gets the binary data type used for binary messages.
   * - 'nodebuffer': Node.js Buffer
   * - 'arraybuffer': JavaScript ArrayBuffer
   * - 'uint8array': JavaScript Uint8Array
   */
  public get binaryType(): 'nodebuffer' | 'arraybuffer' | 'uint8array' {
    return this._binaryType;
  }

  /**
   * Sets the binary data type used for binary messages.
   */
  public set binaryType(value: 'nodebuffer' | 'arraybuffer' | 'uint8array') {
    this._binaryType = value;
  }

  /**
   * Gets the current state of the WebSocket connection.
   * - 0 (CONNECTING): Connection is being established
   * - 1 (OPEN): Connection is open and ready to communicate
   * - 2 (CLOSING): Connection is being closed
   * - 3 (CLOSED): Connection is closed
   */
  public get readyState(): WebSocketReadyState {
    return this._readyState;
  }

  /**
   * Sets the current state of the WebSocket connection.
   */
  public set readyState(value: WebSocketReadyState) {
    this._readyState = value;
  }

  /**
   * Gets the custom data attached to this WebSocket connection.
   * This data is persisted throughout the connection lifecycle.
   */
  public get data(): WebSocketData<T> {
    return this._data;
  }

  /**
   * Sets the custom data attached to this WebSocket connection.
   */
  public set data(value: WebSocketData<T>) {
    this._data = value;
  }

  /**
   * Gets the namespace this socket belongs to.
   * The namespace is used to prefix all topic names for isolation.
   */
  public get namespace(): string {
    return this._namespace;
  }

  /**
   * Gets the unique identifier for this socket connection.
   */
  public get id(): string {
    return this._id;
  }

  /**
   * Sets the unique identifier for this socket connection.
   */
  public set id(value: string) {
    this._id = value;
  }

  /**
   * Returns the number of bytes currently buffered (queued but not yet sent).
   * Useful for flow control and detecting backpressure.
   *
   * @returns The number of bytes buffered
   */
  public getBufferedAmount(): number {
    return this.ws.getBufferedAmount();
  }

  /**
   * Creates a namespaced topic by prefixing the topic name with the socket's namespace.
   * This ensures topic isolation between different WebSocket services.
   *
   * @param topic - The topic name to namespace
   * @returns The namespaced topic in format "namespace.topic"
   * @private
   */
  private createTopic(topic: string): string {
    return `${this.namespace}.${topic}`;
  }
}

/**
 * Type alias for AsenaSocket for convenience and backwards compatibility.
 *
 * @template T - Custom data type attached to the WebSocket connection
 */
export type Socket<T = any> = AsenaSocket<T>;
