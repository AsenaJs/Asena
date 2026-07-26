/**
 * @description A single field-level validation failure.
 *
 * Mirrors the shape of a Zod issue without depending on Zod - the core package
 * stays dependency-free, and each adapter maps its own validator's issues onto this.
 */
export interface ValidationIssue {
  /** Path to the offending field, e.g. `['user', 'email']` */
  path: (string | number)[];

  /** Human-readable description of what failed */
  message: string;

  /** Validator-specific issue code, e.g. `invalid_type` */
  code?: string;
}

/**
 * Brand used instead of `instanceof`. A project that ends up with two copies of an
 * adapter would have two distinct `ValidationError` classes, and `instanceof` would
 * silently answer false for one of them; a registered symbol does not have that problem.
 */
export const VALIDATION_ERROR = Symbol.for('asena.validationError');

/**
 * @description The contract every adapter's validation error satisfies.
 *
 * Adapters throw their own subclass of their HTTP exception type (so an existing
 * `error instanceof HTTPException` branch keeps answering 400), and implement this
 * on top of it so applications can read the failure in an adapter-agnostic way.
 */
export interface ValidationErrorLike extends Error {
  readonly [VALIDATION_ERROR]: true;

  /** Which part of the request failed validation: `json`, `query`, `param`, ... */
  readonly target: string;

  /** The individual field failures */
  readonly issues: ValidationIssue[];

  /** The underlying validator error, untyped here to keep core dependency-free */
  readonly cause: unknown;
}

/**
 * @description Whether an error came from request validation.
 *
 * Use this in `ConfigService.onError` to give validation failures their own response
 * envelope:
 * ```typescript
 * public onError(error: Error, context: Context) {
 *   if (isValidationError(error)) {
 *     return context.send({ success: false, errors: error.issues }, 400);
 *   }
 *   return context.send({ success: false, message: 'Internal error' }, 500);
 * }
 * ```
 * @param {unknown} error - The error to test
 * @returns {boolean} True when the error is an adapter validation error
 */
export const isValidationError = (error: unknown): error is ValidationErrorLike =>
  typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[VALIDATION_ERROR] === true;
