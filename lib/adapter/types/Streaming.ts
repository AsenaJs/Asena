/**
 * SSE message format following the Server-Sent Events specification.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
 */
export interface SSEMessage {
  /** The data field. Multi-line strings are automatically split into separate data: lines. */
  data: string;
  /** Optional event type name */
  event?: string;
  /** Optional event ID for reconnection */
  id?: string;
  /** Optional reconnection time in milliseconds */
  retry?: number;
}

/**
 * Writer interface for generic streaming responses.
 * Adapter implementations provide concrete instances backed by TransformStream.
 */
export interface AsenaStreamWriter {
  /** Write raw bytes or a string to the stream */
  write(input: Uint8Array | string): Promise<void>;
  /** Write a string followed by a newline */
  writeln(input: string): Promise<void>;
  /** Close the stream normally */
  close(): Promise<void>;
  /** Pipe a ReadableStream through this writer */
  pipe(body: ReadableStream): Promise<void>;
  /** Register a callback for when the client disconnects */
  onAbort(listener: () => void | Promise<void>): void;
  /** Whether the stream has been aborted by the client */
  readonly aborted: boolean;
  /** Whether the stream has been closed normally */
  readonly closed: boolean;
}

/**
 * Writer interface for SSE streaming responses.
 * Extends the base writer with SSE-specific writeSSE method.
 */
export interface AsenaSSEStreamWriter extends AsenaStreamWriter {
  /** Write a formatted SSE message */
  writeSSE(message: SSEMessage): Promise<void>;
}
