import { HttpException, isHttpException } from '../../adapter/types/HttpException';
import type { CatchEntry, ExceptionType } from './types';

/**
 * Resolves a thrown value to the `@Catch` handler that should answer it.
 *
 * Built once at boot by `PrepareExceptionHandlerService` - which is also where duplicate types are
 * rejected, so by the time anything lands here every type maps to exactly one entry.
 *
 * ## How a handler is chosen
 *
 * 1. **Identity, walking the prototype chain upward.** The first `@Catch` found on the thrown
 *    value's constructor chain wins, which is by definition the most specific one - the same
 *    answer Spring's `ExceptionDepthComparator` produces, without having to collect candidates
 *    and sort them.
 * 2. **The `HttpException` brand**, if `@Catch(HttpException)` was declared and step 1 found
 *    nothing. See {@link ExceptionRegistry.brandEntry} for why this exists at all.
 * 3. **The catch-all** `@Catch()`, if one was declared.
 * 4. Nothing - the caller falls back to whatever it does by default.
 *
 * Identity always beats the brand: with both `@Catch(ValidationError)` and
 * `@Catch(HttpException)` declared, a `ValidationError` reaches the first, because step 1 runs
 * to completion before step 2 is considered.
 */
export class ExceptionRegistry {
  /** Exception class -> the handler that answers it. Populated at boot, never after. */
  private readonly byType = new Map<ExceptionType, CatchEntry>();

  /**
   * `@Catch()` with no arguments.
   *
   * Deliberately not stored as `byType.get(Error)`: this must also receive `throw 'boom'`,
   * `throw null` and `throw {}`, none of which have `Error` on their chain. Keeping it in its own
   * slot is what makes `@Catch()` and `@Catch(Error)` genuinely different handlers rather than
   * two spellings of one.
   */
  private catchAll?: CatchEntry;

  /**
   * The `@Catch(HttpException)` entry, if the application declared one.
   *
   * Identity matching alone is not enough for this one type, for two reasons that both bite in
   * practice:
   *
   * - The hono adapter brands hono's own `HTTPException` - a completely unrelated class - so that
   *   a 401 from `hono/bearer-auth` is answered from its own status. Identity cannot see it.
   * - A project that resolves two copies of `@asenajs/asena` ends up with two `HttpException`
   *   classes, and the chain walk silently misses the other one. That is the exact failure the
   *   `Symbol.for` brand was introduced to close, and re-introducing it here would undo it.
   *
   * The brand is only consulted after identity has failed, so a more specific `@Catch` still
   * wins.
   */
  private brandEntry?: CatchEntry;

  /**
   * Memoises step 1 per constructor: chain walks are short (2-4 links) but they run on a path
   * that a request storm hits repeatedly. `WeakMap` so a class going out of scope still gets
   * collected.
   *
   * Only the identity result is cached. The brand cannot be, because it is an *instance*
   * property - `HttpException` sets it in the constructor, so two errors sharing a constructor
   * can disagree about carrying it, and a constructor-keyed cache would answer for both.
   */
  private readonly identityCache = new WeakMap<Function, CatchEntry | null>();

  /**
   * Registers a handler for the given types.
   *
   * @param types - Error classes; empty registers the catch-all
   * @param entry - The bound method and where it came from
   */
  public register(types: ExceptionType[], entry: CatchEntry): void {
    if (!types.length) {
      this.catchAll = entry;
      return;
    }

    for (const type of types) {
      this.byType.set(type, entry);

      // Recorded separately, not instead of - `byType` still holds it so an exception that *is*
      // identity-matched as an HttpException short-circuits without touching the brand.
      if (type === HttpException) {
        this.brandEntry = entry;
      }
    }
  }

  /** Whether anything at all was registered. Used to decide if the adapter needs wiring up. */
  public get isEmpty(): boolean {
    return this.byType.size === 0 && !this.catchAll;
  }

  /**
   * Finds the handler for a thrown value.
   *
   * @param error - Whatever was thrown. Not necessarily an `Error`.
   * @returns The handler, or `undefined` when nothing matches
   */
  public resolve(error: unknown): CatchEntry | undefined {
    const identity = this.resolveByIdentity(error);

    if (identity) {
      return identity;
    }

    if (this.brandEntry && isHttpException(error)) {
      return this.brandEntry;
    }

    return this.catchAll;
  }

  private resolveByIdentity(error: unknown): CatchEntry | undefined {
    // `throw null`, `throw undefined` and primitives have no constructor to walk. They are not a
    // failure to handle - they are precisely what the catch-all exists for.
    const ctor = (error as { constructor?: Function } | null | undefined)?.constructor;

    if (typeof ctor !== 'function') {
      return undefined;
    }

    const cached = this.identityCache.get(ctor);

    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const found = this.walk(ctor);

    // `null` records a miss, so a type nobody catches is not re-walked on every request.
    this.identityCache.set(ctor, found ?? null);

    return found;
  }

  private walk(ctor: Function): CatchEntry | undefined {
    for (
      let current: unknown = ctor;
      typeof current === 'function' && current !== Function.prototype;
      current = Object.getPrototypeOf(current)
    ) {
      const entry = this.byType.get(current as ExceptionType);

      if (entry) {
        return entry;
      }
    }

    return undefined;
  }
}
