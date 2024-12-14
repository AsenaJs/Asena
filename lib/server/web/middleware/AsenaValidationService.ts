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
}
