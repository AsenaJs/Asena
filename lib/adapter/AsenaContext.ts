import type { AsenaSSEStreamWriter, AsenaStreamWriter, CookieExtra, SendOptions } from './types';

/**
 * Augmentable interface for declaring typed context variables.
 * Users can extend this interface via module augmentation to get type-safe getValue/setValue.
 *
 * @example
 * ```typescript
 * declare module '@asenajs/asena/adapter' {
 *   interface AsenaVariables {
 *     user: { id: string; name: string };
 *     session: SessionData;
 *   }
 * }
 *
 * // Now type-safe with autocomplete:
 * context.getValue('user')     // { id: string; name: string }
 * context.setValue('user', u)  // type-checked
 * ```
 */
// eslint-disable-next-line
export interface AsenaVariables {}

/**
 * AsenaContext represents the core context interface for handling HTTP requests and responses in Asena framework.
 * It provides essential methods and properties for request/response handling, data manipulation, and state management.
 *
 * @template R - Type parameter for the underlying request object
 * @template S - Type parameter for the underlying response object
 */
export interface AsenaContext<R, S extends Response> {
  /** The original request object */
  req: R;
  /** The original response object */
  res: S;

  /**
   * The matched route pattern (e.g., `/users/:id`).
   * Set by the adapter's router after matching. Used by OTel and other
   * middleware to produce low-cardinality identifiers instead of raw URLs.
   */
  routePattern?: string;

  /**
   * Request headers stored as key-value pairs
   */
  headers: Record<string, string>;

  /**
   * Retrieves the raw request body as an ArrayBuffer.
   * Useful for handling binary data.
   *
   * @returns {Promise<ArrayBuffer>} The request body as an ArrayBuffer
   */
  getArrayBuffer: () => Promise<ArrayBuffer>;

  /**
   * Automatically parses the request body based on content type.
   * Supports JSON, form data, and other common formats.
   *
   * @returns {Promise<any>} The parsed request body
   */
  getParseBody: () => Promise<any>;

  /**
   * Retrieves the request body as a Blob object.
   * Useful for handling file uploads and binary data.
   *
   * @returns {Promise<Blob>} The request body as a Blob
   */
  getBlob: () => Promise<Blob>;

  /**
   * Retrieves the request body as FormData.
   * Useful for processing multipart/form-data submissions.
   *
   * @returns {Promise<FormData>} The request body as FormData
   */
  getFormData: () => Promise<FormData>;

  /**
   * Retrieves a route parameter by name.
   * Example: For route "/users/:id", getParam("id") returns the actual ID value.
   *
   * @param {string} s - The parameter name to retrieve
   * @returns {string} The parameter value
   */
  getParam: (s: string) => string;

  /**
   * Retrieves and automatically type-casts the request body.
   *
   * @template U - The expected type of the body
   * @returns {Promise<U>} The typed request body
   */
  getBody: <U>() => Promise<U>;

  /**
   * Retrieves a single query parameter value.
   * For URL "?name=john", getQuery("name") returns "john".
   *
   * @param {string} query - The query parameter name
   * @returns {Promise<string>} The query parameter value
   */
  getQuery: (query: string) => Promise<string>;

  /**
   * Retrieves all values for a query parameter that appears multiple times.
   * For URL "?color=red&color=blue", getQueryAll("color") returns ["red", "blue"].
   *
   * @param {string} query - The query parameter name
   * @returns {Promise<string[]>} Array of all values for the query parameter
   */
  getQueryAll: (query: string) => Promise<string[]>;

  /**
   * Retrieves all query parameters as a key-value object.
   * Single-value parameters are returned as strings, multi-value as arrays.
   * For URL "?name=john&color=red&color=blue", returns { name: "john", color: ["red", "blue"] }
   *
   * @returns {Record<string, string | string[]>} All query parameters
   */
  getAllQueries: () => Record<string, string | string[]>;

  /**
   * Retrieves a cookie value by name, with optional signature verification.
   *
   * @param {string} name - The cookie name
   * @param {string | BufferSource} [secret] - Optional secret for verifying signed cookies
   * @returns {Promise<string | false>} The cookie value if found, false otherwise
   */
  getCookie: (name: string, secret?: string | BufferSource) => Promise<string | false>;

  /**
   * Sets a cookie with the specified name, value, and options.
   *
   * @param {string} name - The cookie name
   * @param {string} value - The cookie value
   * @param {CookieExtra<any>} [options] - Cookie options (expires, domain, path, etc.)
   * @returns {Promise<void>}
   */
  setCookie: (name: string, value: string, options?: CookieExtra<any>) => Promise<void>;

  /**
   * Deletes a cookie by setting its expiration to the past.
   *
   * @param {string} name - The cookie name to delete
   * @param {CookieExtra<any>} [options] - Cookie options (domain, path, etc.)
   * @returns {Promise<void>}
   */
  deleteCookie: (name: string, options?: CookieExtra<any>) => Promise<void>;

  /**
   * Retrieves a value from the context's state storage.
   * When AsenaVariables is augmented, provides type-safe access for known keys.
   *
   * @param key - The key to retrieve
   * @returns The stored value
   */
  getValue<K extends keyof AsenaVariables>(key: K): AsenaVariables[K];
  getValue<T = any>(key: string): T;

  /**
   * Stores a value in the context's state storage.
   * When AsenaVariables is augmented, enforces correct value types for known keys.
   *
   * @param key - The key to store under
   * @param value - The value to store
   */
  setValue<K extends keyof AsenaVariables>(key: K, value: AsenaVariables[K]): void;
  // The fallback deliberately excludes augmented keys. Written as a plain `(key: string, value:
  // any)` it won overload resolution for *every* call, so a wrong value on a declared key type-
  // checked fine and the promise above was not kept - `setValue('user', 42)` compiled. Resolving
  // the key to `never` for a known key forces such a call back onto the typed overload, where it
  // fails. Unaugmented, `keyof AsenaVariables` is `never`, so this branch is inert.
  setValue<K extends string>(key: K extends keyof AsenaVariables ? never : K, value: any): void;

  /**
   * Stores a value specifically for WebSocket communication.
   *
   * @param {any} value - The value to store for WebSocket context
   */
  setWebSocketValue: (value: any) => void;

  /**
   * Retrieves the stored WebSocket-specific value.
   *
   * @template T - The expected type of the WebSocket value
   * @returns {T} The stored WebSocket value
   */
  getWebSocketValue: <T>() => T;

  /**
   * Get the client IP address (lazy evaluated).
   * Uses Bun's server.requestIP() under the hood.
   * Result is cached after first call - zero cost if never called.
   *
   * @returns {string | null} The client IP address, or null if unavailable
   */
  getRequestIp?(): string | null;

  /**
   * Set a response header.
   *
   * @param {string} key - Header name
   * @param {string} value - Header value
   */
  setResponseHeader?(key: string, value: string): void;

  /**
   * Start a generic binary/text stream.
   * The callback receives a writer; the method returns a Response backed by the stream.
   *
   * @param cb - Async callback that writes to the stream
   * @param onError - Optional error handler
   * @returns Response backed by the readable side of the stream
   */
  stream(
    cb: (stream: AsenaStreamWriter) => Promise<void>,
    onError?: (error: Error, stream: AsenaStreamWriter) => Promise<void>,
  ): Response | Promise<Response>;

  /**
   * Start a Server-Sent Events stream.
   * Sets appropriate SSE headers automatically (text/event-stream, no-cache, keep-alive).
   *
   * @param cb - Async callback that writes SSE messages
   * @param onError - Optional error handler
   * @returns Response backed by the SSE stream
   */
  streamSSE(
    cb: (stream: AsenaSSEStreamWriter) => Promise<void>,
    onError?: (error: Error, stream: AsenaSSEStreamWriter) => Promise<void>,
  ): Response | Promise<Response>;

  /**
   * Start a text stream with appropriate content-type headers.
   * Sets Content-Type: text/plain and streaming-related headers.
   *
   * @param cb - Async callback that writes text
   * @param onError - Optional error handler
   * @returns Response backed by the text stream
   */
  streamText(
    cb: (stream: AsenaStreamWriter) => Promise<void>,
    onError?: (error: Error, stream: AsenaStreamWriter) => Promise<void>,
  ): Response | Promise<Response>;

  /**
   * Sends an HTML response with appropriate content-type headers.
   *
   * @param {string} data - The HTML content to send
   * @returns {Response | Promise<Response>} The response object
   */
  html: (data: string) => Response | Promise<Response>;

  /**
   * Sends a response with automatic content-type detection.
   *
   * @param {string | any} data - The content to send
   * @param {SendOptions | number} [status] - HTTP status code or send options
   * @returns {Response | Promise<Response>} The response object
   */
  send: (data: string | any, status?: SendOptions | number) => Response | Promise<Response>;

  /**
   * Performs an HTTP redirect to the specified URL.
   *
   * @param {string} url - The destination URL
   */
  redirect: (url: string) => void;
}
