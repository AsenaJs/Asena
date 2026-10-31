import { HttpException, type HttpExceptionInit } from './HttpException';
import { ClientErrorStatusCode, ServerErrorStatusCode } from '../../server/web/types';

/**
 * Ready-made {@link HttpException} subclasses, one per commonly thrown HTTP status.
 *
 * Two reasons they exist rather than leaving everyone to write `new HttpException(404, ...)`:
 *
 * 1. **They are catchable by type.** `@Catch(NotFoundException)` can single one out, which a bare
 *    `HttpException` carrying a runtime status cannot - a decorator argument is a class, not a
 *    number. Without these, every deliberate status collapses into one `@Catch(HttpException)`
 *    branch that has to re-discriminate on `error.status` by hand.
 * 2. The status is no longer a magic number at the throw site.
 *
 * Each takes `(body, options)` - the tail of `HttpException`'s `(status, body, options)`, with the
 * status fixed. `body` defaults to the status' reason phrase, so `throw new NotFoundException()`
 * already answers `404 Not Found`.
 *
 * The `HTTP_EXCEPTION` brand is an instance property on `HttpException`, so every subclass here
 * inherits it and answers to `isHttpException()` without doing anything.
 */

/** 400 - the request was malformed or failed a precondition the caller controls. */
export class BadRequestException extends HttpException {
  public constructor(body: string | object = 'Bad Request', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.BadRequest, body, options);
    // HttpException's constructor sets name = 'HttpException'; reset it so logs and error.name
    // identify the concrete type. Same line in every subclass below.
    this.name = 'BadRequestException';
  }
}

/** 401 - no credentials, or credentials the server could not verify. */
export class UnauthorizedException extends HttpException {
  public constructor(body: string | object = 'Unauthorized', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.Unauthorized, body, options);
    this.name = 'UnauthorizedException';
  }
}

/** 403 - the caller is known and still not allowed. */
export class ForbiddenException extends HttpException {
  public constructor(body: string | object = 'Forbidden', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.Forbidden, body, options);
    this.name = 'ForbiddenException';
  }
}

/**
 * 404 - the record does not exist.
 *
 * Not the same thing as an unmatched route: that is a routing outcome and belongs to
 * `@NotFound()`, which never sees a thrown exception. Throw this one when the route matched
 * and the record did not.
 */
export class NotFoundException extends HttpException {
  public constructor(body: string | object = 'Not Found', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.NotFound, body, options);
    this.name = 'NotFoundException';
  }
}

/** 405 - the path exists, the verb does not. */
export class MethodNotAllowedException extends HttpException {
  public constructor(body: string | object = 'Method Not Allowed', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.MethodNotAllowed, body, options);
    this.name = 'MethodNotAllowedException';
  }
}

/** 406 - nothing the server can produce satisfies the `Accept` header. */
export class NotAcceptableException extends HttpException {
  public constructor(body: string | object = 'Not Acceptable', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.NotAcceptable, body, options);
    this.name = 'NotAcceptableException';
  }
}

/** 408 - the client took too long to send the request. */
export class RequestTimeoutException extends HttpException {
  public constructor(body: string | object = 'Request Timeout', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.RequestTimeout, body, options);
    this.name = 'RequestTimeoutException';
  }
}

/** 409 - the request collides with the resource's current state. */
export class ConflictException extends HttpException {
  public constructor(body: string | object = 'Conflict', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.Conflict, body, options);
    this.name = 'ConflictException';
  }
}

/** 410 - the record existed and was deliberately removed. */
export class GoneException extends HttpException {
  public constructor(body: string | object = 'Gone', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.Gone, body, options);
    this.name = 'GoneException';
  }
}

/** 412 - a conditional header (`If-Match`, `If-Unmodified-Since`) did not hold. */
export class PreconditionFailedException extends HttpException {
  public constructor(body: string | object = 'Precondition Failed', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.PreconditionFailed, body, options);
    this.name = 'PreconditionFailedException';
  }
}

/** 413 - the request body is larger than the server accepts. */
export class PayloadTooLargeException extends HttpException {
  public constructor(body: string | object = 'Payload Too Large', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.PayloadTooLarge, body, options);
    this.name = 'PayloadTooLargeException';
  }
}

/** 415 - the request's `Content-Type` is not one the endpoint parses. */
export class UnsupportedMediaTypeException extends HttpException {
  public constructor(body: string | object = 'Unsupported Media Type', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.UnsupportedMediaType, body, options);
    this.name = 'UnsupportedMediaTypeException';
  }
}

/** 418 - RFC 2324. Kept because the ecosystem expects it to exist. */
export class ImATeapotException extends HttpException {
  public constructor(body: string | object = "I'm a Teapot", options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.ImATeapot, body, options);
    this.name = 'ImATeapotException';
  }
}

/**
 * 422 - the body parsed but failed a semantic rule.
 *
 * Note the adapters raise their own `ValidationError` (also a 4xx `HttpException`) for a failed
 * *request* validation. This one is for rules your own code enforces.
 */
export class UnprocessableEntityException extends HttpException {
  public constructor(body: string | object = 'Unprocessable Entity', options?: HttpExceptionInit) {
    super(ClientErrorStatusCode.UnprocessableEntity, body, options);
    this.name = 'UnprocessableEntityException';
  }
}

/** 500 - the server failed and the caller can do nothing about it. */
export class InternalServerErrorException extends HttpException {
  public constructor(body: string | object = 'Internal Server Error', options?: HttpExceptionInit) {
    super(ServerErrorStatusCode.InternalServerError, body, options);
    this.name = 'InternalServerErrorException';
  }
}

/** 501 - the endpoint exists but the behaviour is not built yet. */
export class NotImplementedException extends HttpException {
  public constructor(body: string | object = 'Not Implemented', options?: HttpExceptionInit) {
    super(ServerErrorStatusCode.NotImplemented, body, options);
    this.name = 'NotImplementedException';
  }
}

/** 502 - an upstream the server depends on answered with something unusable. */
export class BadGatewayException extends HttpException {
  public constructor(body: string | object = 'Bad Gateway', options?: HttpExceptionInit) {
    super(ServerErrorStatusCode.BadGateway, body, options);
    this.name = 'BadGatewayException';
  }
}

/** 503 - temporarily down; the caller should retry. */
export class ServiceUnavailableException extends HttpException {
  public constructor(body: string | object = 'Service Unavailable', options?: HttpExceptionInit) {
    super(ServerErrorStatusCode.ServiceUnavailable, body, options);
    this.name = 'ServiceUnavailableException';
  }
}

/** 504 - an upstream the server depends on did not answer in time. */
export class GatewayTimeoutException extends HttpException {
  public constructor(body: string | object = 'Gateway Timeout', options?: HttpExceptionInit) {
    super(ServerErrorStatusCode.GatewayTimeout, body, options);
    this.name = 'GatewayTimeoutException';
  }
}

/** 505 - the request's HTTP version is not supported. */
export class HttpVersionNotSupportedException extends HttpException {
  public constructor(body: string | object = 'HTTP Version Not Supported', options?: HttpExceptionInit) {
    super(ServerErrorStatusCode.HttpVersionNotSupported, body, options);
    this.name = 'HttpVersionNotSupportedException';
  }
}
