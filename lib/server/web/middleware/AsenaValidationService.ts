/**
 * Abstract class representing a validation service.
 * @template H - The handler type of each validator controller.
 */
// every validation service is a middleware service so we need to make sure this is a middleware service
export interface AsenaValidationService<H> {
  /**
   * Validates JSON data.
   * @returns {H} The handler for JSON validation.
   */
  json?(): H;

  /**
   * Validates form data.
   * @returns {H} The handler for form validation.
   */
  form?(): H;

  /**
   * Validates query parameters.
   * @returns {H} The handler for query validation.
   */
  query?(): H;

  /**
   * Validates route parameters.
   * @returns {H} The handler for parameter validation.
   */
  param?(): H;

  /**
   * Validates headers.
   * @returns {H} The handler for header validation.
   */
  header?(): H;
}
