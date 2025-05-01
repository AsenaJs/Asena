import type { AsenaContext } from '../../../adapter';

/**
 * Abstract configuration class for serving static files in Asena applications.
 * Provides customization options for handling static file requests.
 *
 * @template C - Type extending AsenaContext for request/response handling
 * @template E - Type for additional configuration options
 */
export abstract class StaticServeConfig<C extends AsenaContext<any, any>, E = any> {

  /**
   * Root directory path from which to serve static files
   * @protected
   */
  protected root?: string;

  /**
   * Additional configuration options specific to the implementation
   * @protected
   */
  protected extra?: E;

  /**
   * Function to rewrite incoming request paths before serving files
   * @param {string} path - The original request path
   * @returns {string} The rewritten path to use for file lookup
   * @protected
   */
  protected rewriteRequestPath?: (path: string) => string;

  /**
   * Callback triggered when a requested static file is successfully found
   * @param {string} path - The path of the found file
   * @param {C} c - The request context
   * @returns {void | Promise<void>} Optional Promise for asynchronous operations
   * @abstract
   */
  public abstract onFound?: (path: string, c: C) => void | Promise<void>;

  /**
   * Callback triggered when a requested static file cannot be found
   * @param {string} path - The path of the file that was not found
   * @param {C} c - The request context
   * @returns {void | Promise<void>} Optional Promise for asynchronous operations
   * @abstract
   */
  public abstract onNotFound?: (path: string, c: C) => void | Promise<void>;

}


export interface StaticServeParams{
  root: string;
  rewriteRequestPath?: (path: string) => string;
};
