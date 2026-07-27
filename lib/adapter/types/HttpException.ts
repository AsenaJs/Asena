/**
 * Brand used instead of `instanceof`.
 *
 * A project that resolves two copies of an adapter - pnpm without hoisting, a transitive
 * dependency pinning a different minor, a workspace package with its own `node_modules` - ends
 * up with two distinct `HttpException` classes, and `instanceof` silently answers false for one
 * of them. Every deliberate 401/403/404/429 then collapses to a generic 500, and the API still
 * responds, so nothing looks broken.
 *
 * The hono adapter is the more exposed of the two: its base is `HTTPException` from
 * `hono/http-exception`, which the adapter carries as a regular *dependency*. An application that
 * also depends on `hono` directly - the ordinary case, since that is where `HTTPException` is
 * documented - can therefore resolve a second copy, which makes two `hono` copies considerably
 * more likely than two copies of the adapter. Note the brand cannot help there: it is installed on
 * the prototype of the copy the adapter resolved and cannot reach another copy's class. Import
 * `HTTPException` from `@asenajs/hono-adapter` to stay on one copy.
 *
 * `ValidationError` and the removed `NotFoundError` were branded from the start; the base class
 * users actually throw was not. This closes that gap.
 */
export const HTTP_EXCEPTION = Symbol.for('asena.httpException');

/**
 * @description The contract every adapter's HTTP exception satisfies.
 */
export interface HttpExceptionLike extends Error {
  readonly [HTTP_EXCEPTION]: true;

  /**
   * HTTP status code the exception should be answered with.
   *
   * Only `status` is in the contract. Ergenecore's exception carries a structured `body`,
   * Hono's carries a `message` and a `getResponse()` - `status` is the part both agree on and
   * the part an adapter-agnostic handler can actually use.
   */
  readonly status: number;
}

/**
 * @description Whether an error is an adapter HTTP exception.
 *
 * Prefer this over `error instanceof HttpException` in `ConfigService.onError`:
 * ```typescript
 * public onError(error: Error, context: Context) {
 *   if (isHttpException(error)) {
 *     return context.send({ error: error.message }, error.status);
 *   }
 *   return context.send({ error: 'Internal Server Error' }, 500);
 * }
 * ```
 * @param {unknown} error - The error to test
 * @returns {boolean} True when the error is an adapter HTTP exception
 */
export const isHttpException = (error: unknown): error is HttpExceptionLike =>
  typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[HTTP_EXCEPTION] === true;
