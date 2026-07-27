import type { AsenaContext } from '../../../adapter';
import type { ComponentParams } from '../../../ioc';
import type { Class } from '../../types';

/**
 * Abstract configuration class for serving static files in Asena applications.
 * Provides customization options for handling static file requests.
 *
 * @template C - Type extending AsenaContext for request/response handling
 * @template E - Type for additional configuration options
 */
// The interface below is merged into this class on purpose (see its own doc comment). A merged
// class and interface must declare identical type parameter lists, so each half necessarily
// leaves one of them unused - the class uses E, the interface uses C.
/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-unused-vars */
export abstract class AsenaStaticServeService<C extends AsenaContext<any, any>, E = any> {
  /**
   * Additional configuration options specific to the implementation
   * @protected
   */
  public extra?: E;

  /**
   * Root directory path from which to serve static files
   * @protected
   */
  protected root?: string;
}

/**
 * Optional lifecycle hooks, declared through interface merging rather than as
 * `abstract` members.
 *
 * They are genuinely optional - the framework guards each one with a presence check
 * before calling it (see PrepareStaticServeConfigService) - but `abstract onFound?()`
 * would still force every subclass to implement it, and declaring them as class
 * properties would clash with subclasses that implement them as methods (TS2425).
 * Merging optional method signatures in an interface gives the intended semantics:
 * override what you need, omit the rest.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
export interface AsenaStaticServeService<C extends AsenaContext<any, any>, E = any> {
  /**
   * Rewrite an incoming request path before the file lookup
   *
   * @param {string} path - The original request path
   * @returns {string} The rewritten path to use for file lookup
   */
  rewriteRequestPath?(path: string): string;

  /**
   * Callback triggered when a requested static file is successfully found
   * @param {string} path - The path of the found file
   * @param {C} c - The request context
   * @returns {void | Promise<void>} Optional Promise for asynchronous operations
   */
  onFound?(path: string, c: C): void | Promise<void>;

  /**
   * Callback triggered when a requested static file cannot be found
   * @param {string} path - The path of the file that was not found
   * @param {C} c - The request context
   * @returns {void | Promise<void>} Optional Promise for asynchronous operations
   */
  onNotFound?(path: string, c: C): void | Promise<void>;
}

/**
 * Interface defining parameters for static file serving configuration.
 * Used to configure path resolution and request processing for static assets.
 */
export interface StaticServeParams extends ComponentParams {
  /**
   * Root directory path from which to serve static files.
   * This path serves as the base directory for all static assets.
   */
  root?: string;
}

export type StaticServeClass = Class<AsenaStaticServeService<AsenaContext<any, any>>>;
