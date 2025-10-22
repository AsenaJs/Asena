import type { HttpMethod } from '../../server/web/types';
import type { AsenaContext } from '../index';
import type { MiddlewareClass, StaticServeClass, ValidatorClass } from '../../server/web/middleware';

/**
 * Interface representing a route configuration.
 *
 * @template C - The context type extending AsenaContext.
 * @template SH - The schema type for validation.
 */
export interface Route<C extends AsenaContext<any, any> = any, SH = unknown> {
  /**
   * A dictionary where the key is a string representing the route name
   * and the value is an object containing the parameters for the API route.
   */
  [key: string]: ApiParams<C, SH>;
}

/**
 * Interface representing the parameters for an API route.
 *
 * @template C - The context type extending AsenaContext.
 * @template SH - The schema type for validation.
 */
export interface ApiParams<C extends AsenaContext<any, any> = any, SH = unknown> {
  /** The path for the route. */
  path: string;
  /** The HTTP method for the route. */
  method: HttpMethod;
  /** A brief description of the route. */
  description: string;
  /** An array of middleware classes to be applied to the route. */
  middlewares: MiddlewareClass<C>[];
  /** A flag indicating whether to serve static files. */
  staticServe: StaticServeClass;
  /** The validator class for request validation. */
  validator: ValidatorClass<SH>;
}

/**
 * Type definition for a controller handler function.
 *
 * @template C - The context type extending AsenaContext.
 * @param {C} c - The context object for the request and response.
 * @param {...any[]} args - Additional arguments passed to the handler.
 * @returns {void | Promise<void> | Promise<Response> | Response} - The result of the handler, which can be void, a promise resolving to void, a promise resolving to a Response, or a Response.
 */
export type ControllerHandler<C extends AsenaContext<any, any> = any> = (
  c: C,
  ...args: any[]
) => void | Promise<void> | Promise<Response> | Response;

/**
 * Interface for defining parameters for a controller decorator.
 *
 * @template C - The context type extending AsenaContext.
 * @template SH - The schema type for validation.
 */
export interface ControllerDecoratorParams<C extends AsenaContext<any, any> = any, SH = any> {
  /**
   * The path for the route.
   */
  path: string;

  /**
   * Optional array of middleware classes to be applied.
   */
  middlewares?: MiddlewareClass<C>[];

  /**
   * Optional description of the route.
   */
  description?: string;

  /**
   * Optional flag to serve static files.
   */
  staticServe?: StaticServeClass;

  /**
   * Optional validator class for request validation.
   */
  validator?: ValidatorClass<SH>;
}
