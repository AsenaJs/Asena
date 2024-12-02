/*
 * @H is handler type of each validator controller
 *
 *
 */

/**
 * Abstract class representing a validation service.
 * @template H - The handler type of each validator controller.
 */
export abstract class AsenaValidationService<H> {

  /**
   * Validates JSON data.
   * @returns {H} The handler for JSON validation.
   */
  public abstract json?(): H;

  /**
   * Validates form data.
   * @returns {H} The handler for form validation.
   */
  public abstract form?(): H;

  /**
   * Validates query parameters.
   * @returns {H} The handler for query validation.
   */
  public abstract query?(): H;

  /**
   * Validates route parameters.
   * @returns {H} The handler for parameter validation.
   */
  public abstract param?(): H;

  /**
   * Validates headers.
   * @returns {H} The handler for header validation.
   */
  public abstract header?(): H;

}
