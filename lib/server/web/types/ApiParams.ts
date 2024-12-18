import type { HttpMethod } from '../http';
import type { MiddlewareClass, ValidatorClass } from '../../types';
import type { AsenaContext } from '../../../adapter';

/**
 * Interface representing a route configuration.
 *
 * @template R - The request type.
 * @template S - The response type.
 * @template SH - The schema type for validation.
 */
export interface Route<R = unknown, S = unknown, SH = unknown> {
  [key: string]: ApiParams<R, S, SH>;
}

/**
 * Interface representing the parameters for an API route.
 *
 * @template R - The request type.
 * @template S - The response type.
 * @template SH - The schema type for validation.
 */
export interface ApiParams<R = unknown, S = unknown, SH = unknown> {
  /** The path for the route. */
  path: string;
  /** The HTTP method for the route. */
  method: HttpMethod;
  /** A brief description of the route. */
  description: string;
  /** An array of middleware classes to be applied to the route. */
  middlewares: MiddlewareClass<R, S>[];
  /** A flag indicating whether to serve static files. */
  staticServe: boolean;
  /** The validator class for request validation. */
  validator: ValidatorClass<SH>;
}

/**
 * Type definition for a controller handler function.
 *
 * @template R - The request type.
 * @template RE - The response type.
 * @param {AsenaContext<R, RE>} c - The context object for the request and response.
 * @param {...any[]} args - Additional arguments passed to the handler.
 * @returns {void | Promise<void> | Promise<Response> | Response} - The result of the handler, which can be void, a promise resolving to void, a promise resolving to a Response, or a Response.
 */
export type ControllerHandler<R = unknown, RE = unknown> = (
  c: AsenaContext<R, RE>,
  ...args: any[]
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => void | Promise<void> | Promise<Response> | Response;

/**
 * Interface for defining parameters for a controller decorator.
 *
 * @template R - The request type.
 * @template S - The response type.
 * @template SH - The schema type for validation.
 */
export interface ControllerDecoratorParams<R = any, S = any, SH = any> {
  /** The path for the route. */
  path: string;
  /** Optional array of middleware classes to be applied. */
  middlewares?: MiddlewareClass<R, S>[];
  /** Optional description of the route. */
  description?: string;
  /** Optional flag to serve static files. */
  staticServe?: boolean;
  /** Optional validator class for request validation. */
  validator?: ValidatorClass<SH>;
}
