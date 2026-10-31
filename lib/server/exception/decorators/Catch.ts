import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils';
import type { CatchHandlerMetadata, ExceptionType } from '../types';

/**
 * @description Marks a method as the handler for the given exception types.
 *
 * Resolution is **most specific wins**: the thrown value's constructor chain is walked upward and
 * the first `@Catch` found answers. `@Catch(ValidationError)` therefore beats
 * `@Catch(HttpException)` for a `ValidationError`, without either declaring an order.
 *
 * An exception type may be caught in exactly one place across the whole application - a second
 * `@Catch` on the same type fails the boot rather than picking silently. Narrow one of them to a
 * subclass if both are really needed.
 *
 * **`@Catch()` with no arguments is a catch-all, and is not the same as `@Catch(Error)`:**
 *
 * | | `@Catch(Error)` | `@Catch()` |
 * |---|---|---|
 * | `throw new TypeError()` | matches | goes to `@Catch(Error)` when one exists |
 * | `throw 'boom'` / `throw null` / `throw {}` | **no match** | matches |
 *
 * So non-`Error` throws only ever reach the catch-all, which is what lets a typed handler read
 * `error.message` without checking first.
 *
 * A routing 404 is **not** an error and never reaches `@Catch()`, not even the catch-all - it has
 * its own hook, `@NotFound()`.
 *
 * @param types - Error classes to handle. None means catch-all.
 *
 * @example
 * ```typescript
 * @ExceptionHandler()
 * export class ApiExceptionHandler {
 *   @Catch(UserNotFoundError, OrderNotFoundError)
 *   public missing(error: Error, ctx: ExceptionContext<Context>) {
 *     if (ctx.scope !== 'http') return;
 *     return ctx.context.send({ error: error.message }, 404);
 *   }
 *
 *   @Catch()
 *   public fallback(error: unknown, ctx: ExceptionContext<Context>) {
 *     if (ctx.scope !== 'http') return;
 *     return ctx.context.send({ error: 'Internal Server Error' }, 500);
 *   }
 * }
 * ```
 */
export function Catch(...types: ExceptionType[]): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const methodName = propertyKey.toString();
    const className = target.constructor.name;

    types.forEach((type, index) => {
      if (typeof type === 'function') return;

      // Caught at decoration time because the alternative is worse: an `undefined` entry silently
      // never matches anything, so the handler simply never runs and the boot stays green.
      const received = type === undefined ? '`undefined`' : type === null ? '`null`' : `a ${typeof type}`;

      throw new Error(
        `@Catch() on ${className}.${methodName}() received ${received} at position ${index} — pass an error class. ` +
          `A circular import between the handler and the error's module is the usual cause of an undefined here.`,
      );
    });

    // Own-only, matching @MessagePattern: this accumulates the *other* methods of this same
    // class, which all live on this constructor. Inheritance is handled when the metadata is
    // read, by getChainedTypedMetadata.
    const handlers =
      getOwnTypedMetadata<Record<string, CatchHandlerMetadata>>(
        ComponentConstants.ExceptionHandlersKey,
        target.constructor,
      ) || {};

    handlers[methodName] = { methodName, types };

    defineTypedMetadata(ComponentConstants.ExceptionHandlersKey, handlers, target.constructor);

    return descriptor;
  };
}
