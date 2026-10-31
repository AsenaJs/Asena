import { type ComponentParams, ComponentType } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';

/**
 * Decorator that marks a class as an exception handler.
 *
 * The class is a normal IoC component - it is found by component scanning, resolved from the
 * container, and `@Inject` works in it - so a handler can reach a logger, an audit service or
 * anything else the application already registers. Its `@Catch` methods answer errors raised
 * anywhere the framework dispatches: HTTP handlers and middlewares, `@On` events, and
 * `@MessagePattern` / `@EventPattern` handlers.
 *
 * **Several `@ExceptionHandler` classes may exist** and their handlers are merged into one
 * resolution table, so error handling can be split by domain instead of piling into one file.
 * What may *not* happen is two of them catching the same exception type: that fails the boot,
 * because nothing would decide which one answers.
 *
 * Declaring one changes nothing on its own - until a `@Catch` matches, the framework answers
 * exactly as it does today.
 *
 * @param {ComponentParams | string} params - Component parameters or component name
 * @returns {ClassDecorator} A class decorator that registers the class as an exception handler
 *
 * @example
 * ```typescript
 * @ExceptionHandler()
 * export class ApiExceptionHandler {
 *   @Inject(LogService)
 *   private log: LogService;
 *
 *   @Catch(HttpException)
 *   public http(error: HttpExceptionLike, ctx: ExceptionContext<Context>) {
 *     if (ctx.scope !== 'http') return;
 *     return error.getResponse?.() ?? ctx.context.send({ error: error.message }, error.status);
 *   }
 * }
 * ```
 */
export const ExceptionHandler = (params?: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.EXCEPTION_HANDLER, params);
};
