import type { Class } from '../../types';

/**
 * Defines the shape of a single response entry with optional schema and description.
 * Used in status-code-mapped response definitions.
 *
 * @template S - Schema type
 */
export interface ResponseSchemaDefinition<S> {
  schema?: S;
  description?: string;
}

/**
 * Flexible response schema type for OpenAPI documentation.
 * Supports three formats:
 * - Single schema: treated as the 200 response
 * - Status code map with raw schemas: `{ 201: schema, 400: schema }`
 * - Status code map with definitions: `{ 201: { schema, description } }`
 *
 * @template S - Schema type
 */
export type ResponseSchema<S> = S | Record<number, S | ResponseSchemaDefinition<S>>;

/**
 * Interface representing a validation service.
 * @template S - Schema type.
 */
export interface AsenaValidationService<S> {
  /**
   * Validates JSON data.
   * @returns {Promise<S> | S} The handler for JSON validation.
   */
  json?(): Promise<S> | S;

  /**
   * Validates form data.
   * @returns {Promise<S> | S} The handler for form validation.
   */
  form?(): Promise<S> | S;

  /**
   * Validates query parameters.
   * @returns {Promise<S> | S} The handler for query validation.
   */
  query?(): Promise<S> | S;

  /**
   * Validates route parameters.
   * @returns {Promise<S> | S} The handler for parameter validation.
   */
  param?(): Promise<S> | S;

  /**
   * Validates headers.
   * @returns {Promise<S> | S} The handler for header validation.
   */
  header?(): Promise<S> | S;

  /**
   * Defines the response schema for OpenAPI documentation.
   * Not used at runtime validation — only consumed by documentation generators.
   *
   * Supports three formats:
   * - Single schema: `response() { return z.object({...}); }` → 200 response
   * - Status code map: `response() { return { 201: schema, 400: schema }; }`
   * - Full definitions: `response() { return { 201: { schema, description: '...' } }; }`
   *
   * @returns {Promise<ResponseSchema<S>> | ResponseSchema<S>} The response schema definition.
   */
  response?(): Promise<ResponseSchema<S>> | ResponseSchema<S>;
}

export type ValidatorClass<S = unknown> = Class<AsenaValidationService<S>>;
