import type { CookieExtra } from './types';
import type { SendOptions } from './types';
import type { TypedResponse } from 'hono';

/**
 * Interface representing the context for Asena.
 *
 * @template R - The type of the request object.
 * @template S - The type of the response object.
 */
export interface AsenaContext<R, S> {
  req: R;
  res: S;

  /**
   * Headers associated with the request.
   */
  headers: Record<string, string>;
  /**
   * Retrieves the request body as an ArrayBuffer.
   *
   * @returns {Promise<ArrayBuffer>} A promise that resolves to an ArrayBuffer.
   */
  getArrayBuffer: () => Promise<ArrayBuffer>;

  /**
   * Parses and retrieves the request body.
   *
   * @returns {Promise<any>} A promise that resolves to the parsed body.
   */
  getParseBody: () => Promise<any>;

  /**
   * Retrieves the request body as a Blob.
   *
   * @returns {Promise<Blob>} A promise that resolves to a Blob.
   */
  getBlob: () => Promise<Blob>;

  /**
   * Retrieves the request body as FormData.
   *
   * @returns {Promise<FormData>} A promise that resolves to FormData.
   */
  getFormData: () => Promise<FormData>;

  /**
   * Retrieves a parameter from the request.
   *
   * @param {string} s - The name of the parameter.
   * @returns {string} The value of the parameter.
   */
  getParam: (s: string) => string;

  /**
   * Retrieves the request body as a specified type.
   *
   * @template U - The type to which the body should be parsed.
   * @returns {Promise<U>} A promise that resolves to the parsed body.
   */
  getBody: <U>() => Promise<U>;

  /**
   * Retrieves a query parameter from the request.
   *
   * @param {string} query - The name of the query parameter.
   * @returns {Promise<string>} A promise that resolves to the value of the query parameter.
   */
  getQuery: (query: string) => Promise<string>;

  /**
   * Retrieves all values of a query parameter from the request.
   *
   * @param {string} query - The name of the query parameter.
   * @returns {Promise<string[]>} A promise that resolves to an array of values.
   */
  getQueryAll: (query: string) => Promise<string[]>;

  /**
   * Retrieves a cookie from the request.
   *
   * @param {string} name - The name of the cookie.
   * @param {string | BufferSource} [secret] - Optional secret for signed cookies.
   * @returns {Promise<string | false>} A promise that resolves to the cookie value or false if not found.
   */
  getCookie: (name: string, secret?: string | BufferSource) => Promise<string | false>;

  /**
   * Sets a cookie in the response.
   *
   * @param {string} name - The name of the cookie.
   * @param {string} value - The value of the cookie.
   * @param {CookieExtra<any>} [options] - Optional settings for the cookie.
   * @returns {Promise<void>} A promise that resolves when the cookie is set.
   */
  setCookie: (name: string, value: string, options?: CookieExtra<any>) => Promise<void>;

  /**
   * Deletes a cookie from the response.
   *
   * @param {string} name - The name of the cookie to delete.
   * @param {CookieExtra<any>} [options] - Optional settings for the cookie.
   * @returns {Promise<void>} A promise that resolves when the cookie is deleted.
   */
  deleteCookie: (name: string, options?: CookieExtra<any>) => Promise<void>;

  /**
   * Retrieves a value from the context.
   *
   * @template T - The type of the value.
   * @param {string} key - The key of the value.
   * @returns {T} The value associated with the key.
   */
  getValue: <T>(key: string) => T;

  /**
   * Sets a value in the context.
   *
   * @param {string} key - The key of the value.
   * @param {any} value - The value to set.
   */
  setValue: (key: string, value: any) => void;

  /**
   * Sets a value for WebSocket communication.
   *
   * @param {any} value - The value to set.
   */
  setWebSocketValue: (value: any) => void;

  /**
   * Retrieves a value for WebSocket communication.
   *
   * @template T - The type of the value.
   * @returns {T} The value associated with the WebSocket.
   */
  getWebSocketValue: <T>() => T;

  /**
   * Sends an HTML response.
   *
   * @param {string} data - The HTML data to send.
   * @returns {Response | Promise<Response> | TypedResponse | Promise<TypedResponse>} The response object.
   */
  html: (data: string) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse>;

  /**
   * Sends a response.
   *
   * @param {string | any} data - The data to send.
   * @param {SendOptions | number} [status] - Optional status code or send options.
   * @returns {Response | Promise<Response> | TypedResponse | Promise<TypedResponse>} The response object.
   */
  send: (
    data: string | any,
    status?: SendOptions | number,
  ) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse>;

  /**
   * Redirects the request to a new URL.
   *
   * @param {string} url - The URL to redirect to.
   */
  redirect: (url: string) => void;
}
