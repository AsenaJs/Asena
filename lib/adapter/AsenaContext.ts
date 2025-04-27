import type { CookieExtra, SendOptions } from './types';

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
   * 
   * @template T - The expected type of the value
   * @param {string} key - The key to retrieve
   * @returns {T} The stored value
   */
  getValue: <T>(key: string) => T;

  /**
   * Stores a value in the context's state storage.
   * 
   * @param {string} key - The key to store under
   * @param {any} value - The value to store
   */
  setValue: (key: string, value: any) => void;

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
