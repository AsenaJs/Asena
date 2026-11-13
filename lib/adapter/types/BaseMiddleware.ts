import type { Class } from '../../server/types';
import type { ApiParams } from './ApiParams';
import type { AsenaContext, AsenaMiddlewareHandler } from '../index';

/**
 * Interface representing a base middleware.
 *
 * @Templete context - The current Asena context
 */
export interface BaseMiddleware<C extends AsenaContext<any, any> = any> {
  handle: AsenaMiddlewareHandler<C>;
  override: boolean;
}

/**
 * Interface representing a handler for validation.
 *
 * @template S - The type of schema for validation.
 */
export interface ValidatorHandler<S = unknown> {
  handle: () => Promise<S> | S;
  override: boolean;
}

/**
 * Interface representing a base validator.
 *
 * @template S - The type of schema for validation.
 */
export interface BaseValidator<S = unknown> {
  /**
   * Validator for JSON body.
   */
  json?: ValidatorHandler<S>;

  /**
   * Validator for query parameters.
   */
  query?: ValidatorHandler<S>;

  /**
   * Validator for form data.
   */
  form?: ValidatorHandler<S>;

  /**
   * Validator for URL parameters.
   */
  param?: ValidatorHandler<S>;

  /**
   * Validator for headers.
   */
  header?: ValidatorHandler<S>;
}

/**
 * Interface representing the parameters required to prepare middleware.
 */
export interface PrepareMiddlewareParams {
  controller: Class;
  routePath?: string;
  params?: ApiParams;
}

export const VALIDATOR_METHODS = ['json', 'query', 'form', 'param', 'header'];
