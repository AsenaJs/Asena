import type { AsenaContext } from '../AsenaContext';

/**
 * Answers an error raised while handling a request.
 *
 * **Returning nothing declines**: the adapter answers with its own default and writes the log
 * line, because whoever answers is who records. Both adapters have implemented that since 0.9.0 -
 * `Ergenecore.respondToError` filters on `instanceof Response`, `HonoAdapter.onError` on
 * truthiness.
 *
 * The return type does not say so, and deliberately stays narrow. Widening it to
 * `Response | void` breaks the hono adapter at compile time: `HonoErrorHandler` is this very type
 * and is handed straight to hono's `app.onError`, whose own signature requires
 * `Response | Promise<Response>` - and `Promise<Response | void>` is not assignable to that. A
 * caller that needs to decline casts at its own call site instead, which keeps the cost at the
 * one boundary that needs it rather than on every adapter.
 */
export type ErrorHandler<C extends AsenaContext<any, any>> = (error: Error, context: C) => Response | Promise<Response>;

/**
 * The request that matched no route, normalised by the adapter.
 *
 * `AsenaContext.req` is the adapter's raw request object, and the two adapters disagree about
 * what it exposes - Bun's `Request.url` is absolute (`http://host/missing`) while Hono's
 * `req.path` is just `/missing`. Passing the normalised values makes the same `onNotFound`
 * body work on either adapter, which is the entire reason the hook exists.
 */
export interface NotFoundRequest {
  /** Request path with no origin and no query string, e.g. `/users/9` */
  path: string;
  /** Upper-case HTTP method, e.g. `GET` */
  method: string;
}

/**
 * Answers a request that matched no route.
 *
 * Deliberately separate from {@link ErrorHandler}: a missing route is not an error, it is a
 * routing outcome. Keeping the two apart means `onError` only ever sees something that was
 * actually thrown, and `onNotFound` never has to discriminate.
 *
 * Returning nothing declines, and the return type stays narrow for the same reason - see
 * {@link ErrorHandler}.
 */
export type NotFoundHandler<C extends AsenaContext<any, any>> = (
  context: C,
  request: NotFoundRequest,
) => Response | Promise<Response>;
