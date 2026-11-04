---
'@asenajs/asena': minor
---

`@ExceptionHandler` classes handle errors in one place across HTTP, in-process events and microservices. An `@ExceptionHandler` (from `@asenajs/asena/decorators`) is an ordinary IoC component; its `@Catch(...types)` methods receive the thrown value and an `ExceptionContext` whose `scope` is `'http'`, `'event'` (`@On`) or `'microservice'` (`@MessagePattern` / `@EventPattern`, with `kind: 'message' | 'event'`). `@Catch`, `@NotFound` and the context types are exported from the new `@asenajs/asena/exception` entry point.

- **Resolution:** most specific wins - the thrown value's constructor chain is walked upward, so `@Catch(ValidationError)` beats `@Catch(HttpException)` beats `@Catch(Error)`. A branded `HttpException` from another copy of the package still matches `@Catch(HttpException)`. Several `@ExceptionHandler` classes may exist, but an exception type may be caught in one place only, and there is one `@Catch()` catch-all per application; both are checked at boot.
- **`@Catch()` is not `@Catch(Error)`:** the catch-all also receives non-`Error` throws (`throw 'boom'`), `ValidationError` and `HttpException`.
- **The chain:** returning `undefined` declines. On HTTP a `@Catch` answers with a `Response`; a non-`Response` value is logged as an error and treated as a decline; a `@Catch` that throws is logged and declines. After every `@Catch` declines, `@Config.onError` answers, then the adapter default.
- **`@NotFound()`** answers a request that matched no route - a routing 404 never reaches `@Catch`. One per application; when it declines, `@Config.onNotFound` answers, then the adapter's 404.
- **`@MessagePattern`:** a value other than `undefined` becomes the reply; `undefined` rethrows the original error to the transport.
- **`@EventPattern` and `@On` are observe-only:** a matching `@Catch` runs, but the original failure continues unchanged - rethrown to the transport (retry / DLQ policy applies) for `@EventPattern`, the `[EventDispatchService]` error line for `@On`. A returned value has no effect and logs a warning naming the `@Catch` method.
- **Ready-made status exceptions** in `@asenajs/asena/adapter`, one `HttpException` subclass per common status (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`, `UnprocessableEntityException`, `InternalServerErrorException`, `ServiceUnavailableException` and more), each catchable by type and defaulting its body to the reason phrase.

`@Config.onError` and `@Config.onNotFound` are deprecated and will be removed in 1.0. They keep working as the last link of the chain and log a deprecation warning at boot.
