import type { Class } from '../../types';
import type { ApiParams } from './ApiParams';
import type { AsenaMiddlewareHandler } from '../../../adapter';

/**
 * Interface representing a base middleware.
 *
 * @template R - The request type.
 * @template S - The response type.
 */
export interface BaseMiddleware<R = unknown, S = unknown> {
  handle: AsenaMiddlewareHandler<R, S>;
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
