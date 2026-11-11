import { describe, expect, it } from 'bun:test';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  GoneException,
  HttpException,
  HttpVersionNotSupportedException,
  ImATeapotException,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotAcceptableException,
  NotFoundException,
  NotImplementedException,
  PayloadTooLargeException,
  PreconditionFailedException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  isHttpException,
} from '../../lib/adapter';

/**
 * `Class` is `new (...) => HttpException` rather than `typeof BadRequestException` because the
 * table mixes twenty distinct constructors; the shared shape is all the table needs.
 */
const EXCEPTIONS: [name: string, Class: new (...args: any[]) => HttpException, status: number, reason: string][] = [
  ['BadRequestException', BadRequestException, 400, 'Bad Request'],
  ['UnauthorizedException', UnauthorizedException, 401, 'Unauthorized'],
  ['ForbiddenException', ForbiddenException, 403, 'Forbidden'],
  ['NotFoundException', NotFoundException, 404, 'Not Found'],
  ['MethodNotAllowedException', MethodNotAllowedException, 405, 'Method Not Allowed'],
  ['NotAcceptableException', NotAcceptableException, 406, 'Not Acceptable'],
  ['RequestTimeoutException', RequestTimeoutException, 408, 'Request Timeout'],
  ['ConflictException', ConflictException, 409, 'Conflict'],
  ['GoneException', GoneException, 410, 'Gone'],
  ['PreconditionFailedException', PreconditionFailedException, 412, 'Precondition Failed'],
  ['PayloadTooLargeException', PayloadTooLargeException, 413, 'Payload Too Large'],
  ['UnsupportedMediaTypeException', UnsupportedMediaTypeException, 415, 'Unsupported Media Type'],
  ['ImATeapotException', ImATeapotException, 418, "I'm a Teapot"],
  ['UnprocessableEntityException', UnprocessableEntityException, 422, 'Unprocessable Entity'],
  ['InternalServerErrorException', InternalServerErrorException, 500, 'Internal Server Error'],
  ['NotImplementedException', NotImplementedException, 501, 'Not Implemented'],
  ['BadGatewayException', BadGatewayException, 502, 'Bad Gateway'],
  ['ServiceUnavailableException', ServiceUnavailableException, 503, 'Service Unavailable'],
  ['GatewayTimeoutException', GatewayTimeoutException, 504, 'Gateway Timeout'],
  ['HttpVersionNotSupportedException', HttpVersionNotSupportedException, 505, 'HTTP Version Not Supported'],
];

describe('HttpStatusExceptions', () => {
  it('covers exactly the twenty statuses the package promises', () => {
    // A class added without a table row would otherwise ship untested.
    expect(EXCEPTIONS).toHaveLength(20);
  });

  describe.each(EXCEPTIONS)('%s', (name, Class, status, reason) => {
    it(`answers with ${status}`, () => {
      // The whole point of the class is that the status is not a magic number at the throw site.
      // A wrong one here is an API answering the wrong code with nothing to notice it.
      expect(new Class().status).toBe(status);
      expect(new Class().getResponse().status).toBe(status);
    });

    it('defaults its body to the reason phrase', () => {
      // `throw new NotFoundException()` has to be usable bare - otherwise every throw site is
      // back to inventing a message, which is what these classes exist to avoid.
      const exception = new Class();

      expect(exception.body).toBe(reason);
      expect(exception.message).toBe(reason);
    });

    it('reports its own name, not HttpException', () => {
      // HttpException's constructor sets name = 'HttpException'. Forgetting the reset in a
      // subclass is invisible until a log line names the wrong type, and every subclass is one
      // copy-paste away from that.
      expect(new Class().name).toBe(name);
    });

    it('inherits the brand so adapters answer from its status', () => {
      // Without the brand an adapter falls through to its generic 500 branch and the deliberate
      // status is silently lost - the exact failure `isHttpException` was introduced to prevent.
      expect(isHttpException(new Class())).toBe(true);
    });

    it('stays an HttpException so a broad @Catch still matches it', () => {
      // ExceptionRegistry resolves @Catch by walking the prototype chain, so @Catch(HttpException)
      // matching these depends on this link and nothing else.
      expect(new Class()).toBeInstanceOf(HttpException);
      expect(new Class()).toBeInstanceOf(Error);
    });
  });

  describe('overrides', () => {
    it('takes a custom string body', () => {
      const exception = new NotFoundException('User not found');

      expect(exception.status).toBe(404);
      expect(exception.body).toBe('User not found');
    });

    it('serializes an object body and sets the JSON content type', () => {
      const body = { code: 'USER_NOT_FOUND', id: 42 };
      const response = new NotFoundException(body).getResponse();

      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.status).toBe(404);
    });

    it('passes headers through to the response', () => {
      const response = new ServiceUnavailableException('down for maintenance', {
        headers: { 'Retry-After': '60' },
      }).getResponse();

      expect(response.headers.get('Retry-After')).toBe('60');
    });

    it('keeps the original failure reachable through cause', () => {
      // The reason to wrap at all: the 500 the caller sees must not be the end of the trail.
      const original = new Error('connection refused');
      const exception = new InternalServerErrorException('Database Error', { cause: original });

      expect(exception.cause).toBe(original);
    });
  });
});
