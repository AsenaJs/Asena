import type { AsenaContext } from '../AsenaContext';

/**
 * Answers an error raised while handling a request.
 *
 * **Returning nothing declines**: the adapter answers with its own default and writes the log
 * line, because whoever answers is who records. Both adapters have implemented that since 0.9.0 -
 * `Ergenecore.respondToError` filters on `instanceof Response`, `HonoAdapter.onError` on
 * truthiness. An adapter must therefore await the result and check it is a `Response`, never hand
 * the handler to a framework that expects one.
 */
export type ErrorHandler<C extends AsenaContext<any, any>> = (
  error: Error,
  context: C,
) => Response | undefined | Promise<Response | undefined>;

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
 * Returning nothing declines, as for {@link ErrorHandler}.
 */
export type NotFoundHandler<C extends AsenaContext<any, any>> = (
  context: C,
  request: NotFoundRequest,
) => Response | undefined | Promise<Response | undefined>;
