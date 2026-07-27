import type { AsenaContext } from '../AsenaContext';

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
 */
export type NotFoundHandler<C extends AsenaContext<any, any>> = (
  context: C,
  request: NotFoundRequest,
) => Response | Promise<Response>;
