import type { HttpStatusCode } from '../../server/web/types';

/**
 * Brand used instead of `instanceof`.
 *
 * A project that resolves two copies of an adapter - pnpm without hoisting, a transitive
 * dependency pinning a different minor, a workspace package with its own `node_modules` - ends
 * up with two distinct `HttpException` classes, and `instanceof` silently answers false for one
 * of them. Every deliberate 401/403/404/429 then collapses to a generic 500, and the API still
 * responds, so nothing looks broken.
 *
 * The brand still matters now that the class below lives in core rather than in each adapter:
 * two copies of `@asenajs/asena` produce two `HttpException` classes just as two copies of an
 * adapter used to. It also covers the exception types this package does not own - the hono
 * adapter brands `HTTPException` from `hono/http-exception` onto its prototype, so an exception
 * thrown by `hono/basic-auth` or any other hono middleware answers to `isHttpException()` too.
 */
export const HTTP_EXCEPTION = Symbol.for('asena.httpException');

/**
 * @description The contract every adapter's HTTP exception satisfies.
 *
 * Implemented by {@link HttpException} below, and by exception types Asena does not own -
 * hono's `HTTPException`, which the hono adapter brands so it answers to the same guard.
 * An adapter dispatching on this interface therefore handles both without knowing which it has.
 */
export interface HttpExceptionLike extends Error {
  readonly [HTTP_EXCEPTION]: true;

  /**
   * HTTP status code the exception should be answered with.
   *
   * The one member every branded exception is guaranteed to carry. Foreign exception types
   * satisfy this and little else, which is why an adapter falling back to its default response
   * must be able to answer from `status` alone.
   */
  readonly status: number;

  /**
   * The response this exception answers with, when it can build one.
   *
   * Optional because the brand does not imply it: hono's `HTTPException` and Asena's own
   * `HttpException` both provide it, but a foreign class carrying only the brand and a status
   * is still a valid {@link HttpExceptionLike}. Adapters must check before calling.
   */
  readonly getResponse?: () => Response;
}

/**
 * @description Whether an error is an HTTP exception.
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
 * @returns {boolean} True when the error is an HTTP exception
 */
export const isHttpException = (error: unknown): error is HttpExceptionLike =>
  typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[HTTP_EXCEPTION] === true;

/**
 * Extended ResponseInit with cause support
 */
export interface HttpExceptionInit extends ResponseInit {
  /** The original error that caused this exception */
  cause?: Error;
}

/**
 * HTTP Exception
 *
 * The single class to throw for a deliberate HTTP error, on every adapter. It lives in core
 * rather than in each adapter so the same `throw` compiles and behaves identically whichever
 * adapter the application runs on - previously ergenecore had its own class and the hono adapter
 * re-exported hono's, with different constructor signatures and different response bodies, so
 * moving an application between adapters meant rewriting every throw site.
 *
 * Building a `Response` needs nothing beyond the web globals, so this does not cost the package
 * its zero-dependency rule.
 *
 * @example
 * ```typescript
 * // In middleware
 * if (!user) {
 *   throw new HttpException(401, 'Unauthorized', {
 *     headers: { 'WWW-Authenticate': 'Bearer' }
 *   });
 * }
 *
 * // In handler
 * if (!isValid) {
 *   throw new HttpException(400, { error: 'Invalid data' });
 * }
 *
 * // With cause
 * try { await db.query(...) } catch (err) {
 *   throw new HttpException(500, 'Database Error', { cause: err });
 * }
 * ```
 */
export class HttpException extends Error implements HttpExceptionLike {
  /**
   * Registered-symbol brand so `isHttpException()` works even when a project resolves two
   * copies of this package - `instanceof` answers false across copies, silently.
   */
  public readonly [HTTP_EXCEPTION] = true as const;

  /**
   * HTTP status code
   */
  public readonly status: number;

  /**
   * Response body (can be string or object)
   */
  public readonly body: string | object;

  /**
   * Optional response init options (headers, statusText, cause, etc.)
   */
  public readonly options?: HttpExceptionInit;

  /**
   * Creates a new HttpException
   *
   * @param status - HTTP status code (e.g., 401, 403, 404) or HttpStatusCode enum value
   * @param body - Response body (string or object to be JSON stringified)
   * @param options - Optional HttpExceptionInit options (headers, statusText, cause, etc.)
   *
   * @example
   * ```typescript
   * // Simple message
   * throw new HttpException(404, 'Not Found');
   *
   * // With HttpStatusCode enum
   * throw new HttpException(ClientErrorStatusCode.NotFound, 'Not Found');
   *
   * // JSON object
   * throw new HttpException(400, { error: 'Invalid input', field: 'email' });
   *
   * // With headers
   * throw new HttpException(429, 'Too Many Requests', {
   *   headers: { 'Retry-After': '60' }
   * });
   *
   * // With cause
   * throw new HttpException(500, 'Internal Error', { cause: originalError });
   * ```
   */
  public constructor(status: HttpStatusCode | number, body: string | object = '', options?: HttpExceptionInit) {
    const message = typeof body === 'string' ? body : JSON.stringify(body);

    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'HttpException';
    this.status = status;
    this.body = body;
    this.options = options;
  }

  /**
   * Converts the exception to a Response object
   *
   * @returns Response object ready to be returned
   */
  public getResponse(): Response {
    const body = typeof this.body === 'string' ? this.body : JSON.stringify(this.body);

    const headers = new Headers(this.options?.headers);

    // Set Content-Type to application/json if body is an object and not already set
    if (typeof this.body === 'object' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return new Response(body, {
      status: this.status,
      statusText: this.options?.statusText,
      headers,
    });
  }
}
