import { describe, expect, it } from 'bun:test';
import { ExceptionRegistry } from '../../../lib/server/exception';
import type { CatchEntry } from '../../../lib/server/exception';
import { HTTP_EXCEPTION, HttpException, NotFoundException } from '../../../lib/adapter';

/** A stand-in handler. Only identity matters here, so the body is irrelevant. */
const entry = (source: string): CatchEntry => ({ handler: () => undefined, source });

class DomainError extends Error {}
class UserNotFoundError extends DomainError {}
abstract class AbstractDomainError extends Error {}
class ConcreteDomainError extends AbstractDomainError {}

/**
 * What the hono adapter produces: a class Asena does not own, branded on its prototype so it
 * answers to `isHttpException()`. Deliberately NOT extending Asena's HttpException - that is the
 * whole point of the brand.
 */
class ForeignHttpException extends Error {
  public readonly status = 401;
}
Object.defineProperty(ForeignHttpException.prototype, HTTP_EXCEPTION, { value: true, configurable: true });

describe('ExceptionRegistry', () => {
  describe('specificity', () => {
    it('prefers the subclass over its base', () => {
      // The single promise the whole design rests on. Without it, whichever @Catch happened to be
      // scanned first would answer, which is the failure mode NestJS's first-match is known for.
      const registry = new ExceptionRegistry();

      registry.register([DomainError], entry('base'));
      registry.register([UserNotFoundError], entry('specific'));

      expect(registry.resolve(new UserNotFoundError())?.source).toBe('specific');
      expect(registry.resolve(new DomainError())?.source).toBe('base');
    });

    it('does not depend on registration order', () => {
      // Same as above with the registrations swapped. If this ever diverges, the resolution is
      // order-sensitive and the boot-time duplicate check is no longer enough to make it
      // predictable.
      const registry = new ExceptionRegistry();

      registry.register([UserNotFoundError], entry('specific'));
      registry.register([DomainError], entry('base'));

      expect(registry.resolve(new UserNotFoundError())?.source).toBe('specific');
    });

    it('walks past intermediate classes nobody catches', () => {
      const registry = new ExceptionRegistry();

      registry.register([Error], entry('error'));

      // UserNotFoundError -> DomainError -> Error, and only the last is registered.
      expect(registry.resolve(new UserNotFoundError())?.source).toBe('error');
    });

    it('matches an abstract base class', () => {
      // `abstract new` in ExceptionType exists for this: an abstract domain base is never
      // constructed but is exactly what a handler wants to name.
      const registry = new ExceptionRegistry();

      registry.register([AbstractDomainError], entry('abstract'));

      expect(registry.resolve(new ConcreteDomainError())?.source).toBe('abstract');
    });

    it('registers one handler for several types', () => {
      const registry = new ExceptionRegistry();

      registry.register([TypeError, RangeError], entry('both'));

      expect(registry.resolve(new TypeError())?.source).toBe('both');
      expect(registry.resolve(new RangeError())?.source).toBe('both');
    });
  });

  describe('@Catch(Error) versus @Catch()', () => {
    it('routes an Error subclass to @Catch(Error), not to the catch-all', () => {
      const registry = new ExceptionRegistry();

      registry.register([Error], entry('error'));
      registry.register([], entry('catchAll'));

      expect(registry.resolve(new TypeError())?.source).toBe('error');
    });

    it('leaves non-Error throws to the catch-all', () => {
      // The reason the two are separate handlers. `throw 'boom'` has no Error on its chain, so a
      // typed handler must never see it - that is what lets @Catch(Error) read error.message
      // without checking first.
      const registry = new ExceptionRegistry();

      registry.register([Error], entry('error'));
      registry.register([], entry('catchAll'));

      expect(registry.resolve('boom')?.source).toBe('catchAll');
      expect(registry.resolve({ code: 1 })?.source).toBe('catchAll');
      expect(registry.resolve(42)?.source).toBe('catchAll');
    });

    it('gives null and undefined to the catch-all', () => {
      // `throw null` has no constructor at all. Reading `.constructor` off it unguarded is a
      // TypeError raised from inside the error path - the one place nothing can recover from.
      const registry = new ExceptionRegistry();

      registry.register([], entry('catchAll'));

      expect(registry.resolve(null)?.source).toBe('catchAll');
      expect(registry.resolve(undefined)?.source).toBe('catchAll');
    });

    it('drops a non-Error throw when only @Catch(Error) exists', () => {
      const registry = new ExceptionRegistry();

      registry.register([Error], entry('error'));

      expect(registry.resolve('boom')).toBeUndefined();
    });
  });

  describe('HttpException brand', () => {
    it('matches a foreign branded exception through @Catch(HttpException)', () => {
      // hono's own HTTPException is branded but is not an Asena HttpException. Identity alone
      // would miss it and every deliberate 401 from hono/bearer-auth would fall to the catch-all
      // - i.e. become a 500.
      const registry = new ExceptionRegistry();

      registry.register([HttpException], entry('http'));

      expect(registry.resolve(new ForeignHttpException())?.source).toBe('http');
    });

    it('still prefers a more specific identity match over the brand', () => {
      const registry = new ExceptionRegistry();

      registry.register([HttpException], entry('http'));
      registry.register([NotFoundException], entry('notFound'));

      expect(registry.resolve(new NotFoundException())?.source).toBe('notFound');
    });

    it('does not consult the brand unless @Catch(HttpException) was declared', () => {
      const registry = new ExceptionRegistry();

      registry.register([DomainError], entry('domain'));

      expect(registry.resolve(new ForeignHttpException())).toBeUndefined();
    });

    it('distinguishes two errors that share a constructor', () => {
      // Cache correctness. The brand is an *instance* property, so these two have the same
      // constructor and different answers. Caching the brand result by constructor would hand the
      // HttpException handler an unbranded error - or the reverse - depending on which arrived
      // first.
      const registry = new ExceptionRegistry();

      registry.register([HttpException], entry('http'));
      registry.register([], entry('catchAll'));

      const branded = Object.assign(new Error('unauthorized'), { [HTTP_EXCEPTION]: true, status: 401 });
      const plain = new Error('boom');

      expect(registry.resolve(branded)?.source).toBe('http');
      expect(registry.resolve(plain)?.source).toBe('catchAll');

      // And in the other order, in case the first resolve is what seeds the cache.
      const other = new ExceptionRegistry();

      other.register([HttpException], entry('http'));
      other.register([], entry('catchAll'));

      expect(other.resolve(new Error('boom'))?.source).toBe('catchAll');
      expect(other.resolve(Object.assign(new Error('nope'), { [HTTP_EXCEPTION]: true, status: 403 }))?.source).toBe(
        'http',
      );
    });

    it('returns the same handler on a repeated lookup', () => {
      // Exercises the memoised path rather than trusting it is only an optimisation.
      const registry = new ExceptionRegistry();

      registry.register([UserNotFoundError], entry('specific'));

      const first = registry.resolve(new UserNotFoundError());
      const second = registry.resolve(new UserNotFoundError());

      expect(second).toBe(first!);
    });
  });

  describe('misses', () => {
    it('resolves to nothing when no handler matches', () => {
      // Not an oversight: `undefined` is how the composed chain declines, which is what keeps the
      // adapter answering - and logging - exactly as it does with no @ExceptionHandler at all.
      const registry = new ExceptionRegistry();

      registry.register([DomainError], entry('domain'));

      expect(registry.resolve(new TypeError())).toBeUndefined();
    });

    it('reports emptiness so the adapter is never wired up for nothing', () => {
      const registry = new ExceptionRegistry();

      expect(registry.isEmpty).toBe(true);

      registry.register([DomainError], entry('domain'));

      expect(registry.isEmpty).toBe(false);
    });

    it('counts a lone catch-all as non-empty', () => {
      const registry = new ExceptionRegistry();

      registry.register([], entry('catchAll'));

      expect(registry.isEmpty).toBe(false);
    });
  });
});
