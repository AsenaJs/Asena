import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils';
import type { NotFoundHandlerMetadata } from '../types';

/**
 * @description Marks a method as the handler for a request that matched no route.
 *
 * Kept apart from {@link Catch} on purpose, and this is a decision worth knowing rather than
 * discovering: **a routing 404 is not a thrown error**, so it never reaches `@Catch()` - not even
 * the catch-all. Nothing threw; the router simply had nowhere to send the request. Keeping the two
 * separate means a catch-all never has to ask which of the two it is looking at, and a 404 can
 * never be swallowed by a handler written for exceptions. (0.8 removed a `NotFoundError` that
 * modelled it the other way, for exactly the reason this note exists.)
 *
 * A missing *record* behind a route that does exist is the opposite case - that is an application
 * decision, so throw `NotFoundException` and let a `@Catch` answer it.
 *
 * The signature is the existing `NotFoundHandler` contract unchanged:
 * `(context, request) => Response | void`. `request.path` carries no origin and no query string,
 * and `request.method` is upper-case, both normalised by the adapter - which is what lets the same
 * body work on either adapter.
 *
 * **Exactly one `@NotFound()` may exist across the whole application.** Unlike `@Catch`, there is
 * nothing to discriminate on - every unmatched route looks the same - so a second one is pure
 * ambiguity and fails the boot instead of being ordered arbitrarily.
 *
 * @example
 * ```typescript
 * @ExceptionHandler()
 * export class ApiExceptionHandler {
 *   @NotFound()
 *   public missing(context: Context, request: NotFoundRequest) {
 *     return context.send({ error: 'Not Found', path: request.path }, 404);
 *   }
 * }
 * ```
 */
export function NotFound(): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const methodName = propertyKey.toString();

    // A record rather than a single value so two @NotFound() methods on one class are visible to
    // the boot check as two entries, exactly like two of them on two classes.
    const handlers =
      getOwnTypedMetadata<Record<string, NotFoundHandlerMetadata>>(
        ComponentConstants.NotFoundHandlerKey,
        target.constructor,
      ) || {};

    handlers[methodName] = { methodName };

    defineTypedMetadata(ComponentConstants.NotFoundHandlerKey, handlers, target.constructor);

    return descriptor;
  };
}
