import { describe, expect, test } from 'bun:test';
import { HTTP_EXCEPTION, HttpException, isHttpException, type HttpExceptionLike } from '../../lib/adapter';

/**
 * `isHttpException` is the predicate both adapters use to decide whether a thrown error is a
 * deliberate HTTP status or an unhandled failure - it picks the response *and* the log level on
 * each of them. It lived here untested: the adapters each had their own brand suite, and this
 * package, which owns the symbol and the predicate, had none.
 *
 * The contract is deliberately narrow. Only the brand and `status` are guaranteed; `getResponse`
 * is optional, because the hono adapter brands `HTTPException` - a class it does not own - and a
 * foreign exception type may carry neither a body nor a way to build a response. Anything reading
 * more than `status` off a match has to check first.
 */
describe('HTTP exception brand', () => {
  test('the class this package exports is branded', () => {
    expect(isHttpException(new HttpException(401, 'Unauthorized'))).toBe(true);
  });

  test('a subclass inherits the brand', () => {
    class Forbidden extends HttpException {
      public constructor() {
        super(403, 'Forbidden');
      }
    }

    expect(isHttpException(new Forbidden())).toBe(true);
  });

  test('status is readable through the narrowed type', () => {
    const error: unknown = new HttpException(429, 'Too Many Requests');

    expect(isHttpException(error) && error.status).toBe(429);
  });

  // The case the brand exists for. Two resolved copies of this package produce two distinct
  // `HttpException` classes and `instanceof` answers false for one of them - silently, because
  // the API keeps responding and only the status is wrong. `Symbol.for` crosses copies.
  test('recognises an exception from a second copy of this package', () => {
    const foreign: unknown = Object.assign(Object.create(Error.prototype), {
      [HTTP_EXCEPTION]: true,
      status: 401,
      message: 'Unauthorized',
    });

    expect(foreign instanceof HttpException).toBe(false);
    expect(isHttpException(foreign)).toBe(true);
    expect(isHttpException(foreign) && foreign.status).toBe(401);
  });

  test('a branded exception need not carry getResponse()', () => {
    const brandedOnly: unknown = Object.assign(Object.create(Error.prototype), {
      [HTTP_EXCEPTION]: true,
      status: 503,
    });

    expect(isHttpException(brandedOnly)).toBe(true);

    // What an adapter has to write, and the reason `getResponse` is optional on the interface.
    const narrowed = brandedOnly as HttpExceptionLike;

    expect(typeof narrowed.getResponse).toBe('undefined');
    expect(typeof new HttpException(503, 'x').getResponse).toBe('function');
  });

  test('a plain Error, null and a false brand are not matched', () => {
    expect(isHttpException(new Error('nope'))).toBe(false);
    expect(isHttpException(null)).toBe(false);
    expect(isHttpException(undefined)).toBe(false);
    expect(isHttpException({ [HTTP_EXCEPTION]: false })).toBe(false);
  });

  test('the brand is the registered symbol, so it survives module duplication', () => {
    // Compared as a plain symbol: HTTP_EXCEPTION is typed `unique symbol`, and toBe() narrows
    // its parameter to that same type, so passing the Symbol.for() result - which is only known
    // to be `symbol` - does not typecheck. The runtime identity is exactly what is under test.
    expect(HTTP_EXCEPTION as symbol).toBe(Symbol.for('asena.httpException'));
  });
});
