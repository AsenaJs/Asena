import { HttpException, isHttpException } from '../../adapter/types/HttpException';
import type { CatchEntry, ExceptionType } from './types';

export interface ExceptionRegistryEntry {
  readonly type: ExceptionType | 'catch-all';
  /** `Class.method` of the `@Catch` that answers it. */
  readonly source: string;
}

/** What the registry holds at runtime, for the devtools exception map. Cannot change it. */
export interface ExceptionRegistryView {
  readonly catches: readonly ExceptionRegistryEntry[];
  /** `Class.method` of the `@NotFound()` handler, if one is registered. */
  readonly notFound?: string;
  /** `Class.method` of the `@Catch` this value would reach, by the registry's own rules. */
  whoCatches(error: unknown): string | undefined;
}

export interface IdentityMatch {
  type: ExceptionType;
  entry: CatchEntry;
}

/**
 * Resolves a thrown value to the `@Catch` handler that should answer it.
 *
 * Built once at boot by `PrepareExceptionHandlerService` - which is also where duplicate types are
 * rejected, so by the time anything lands here every type maps to exactly one entry.
 *
 * ## How a handler is chosen
 *
 * 1. **Identity, walking the prototype chain upward.** The first `@Catch` whose `prototype` is on
 *    the thrown value's prototype chain wins - `instanceof` semantics, so `util.inherits`-style
 *    errors match too - and it is by definition the most specific one - the same
 *    answer Spring's `ExceptionDepthComparator` produces, without having to collect candidates
 *    and sort them.
 * 2. **The `HttpException` brand**, if `@Catch(HttpException)` was declared and step 1 found
 *    nothing or only an ancestor of `HttpException` such as `Error`. See
 *    {@link ExceptionRegistry.brandEntry} for why this exists at all.
 * 3. **The catch-all** `@Catch()`, if one was declared.
 * 4. Nothing - the caller falls back to whatever it does by default.
 *
 * Identity always beats the brand: with both `@Catch(ValidationError)` and
 * `@Catch(HttpException)` declared, a `ValidationError` reaches the first, because step 1 runs
 * to completion before step 2 is considered.
 */
export class ExceptionRegistry {
  /** `type.prototype` -> the class and the handler that answers it. Populated at boot, never after. */
  private readonly byPrototype = new Map<unknown, IdentityMatch>();

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
   * The brand is only consulted when identity found nothing narrower than `HttpException`, so a
   * more specific `@Catch` still wins.
   */
  private brandEntry?: CatchEntry;

  /**
   * Memoises step 1 per prototype: chain walks are short (2-4 links) but they run on a path
   * that a request storm hits repeatedly. `WeakMap` so a class going out of scope still gets
   * collected.
   *
   * Only the identity result is cached. The brand cannot be, because it is an *instance*
   * property - `HttpException` sets it in the constructor, so two errors sharing a prototype
   * can disagree about carrying it, and a prototype-keyed cache would answer for both.
   */
  private identityCache = new WeakMap<object, IdentityMatch | null>();

  /**
   * Registers a handler for the given types.
   *
   * @param types - Error classes; empty registers the catch-all
   * @param entry - The bound method and where it came from
   */
  public register(types: ExceptionType[], entry: CatchEntry): void {
    this.identityCache = new WeakMap();

    if (!types.length) {
      this.catchAll = entry;
      return;
    }

    for (const type of types) {
      this.byPrototype.set(type.prototype, { type, entry });

      // Recorded separately, not instead of - `byPrototype` still holds it so an exception that *is*
      // identity-matched as an HttpException short-circuits without touching the brand.
      if (type === HttpException) {
        this.brandEntry = entry;
      }
    }
  }

  /** Every registration, in registration order, the catch-all last. A copy: the registry stays sealed. */
  public entries(): readonly ExceptionRegistryEntry[] {
    const entries: ExceptionRegistryEntry[] = [...this.byPrototype.values()].map(({ type, entry }) =>
      Object.freeze({ type, source: entry.source }),
    );

    if (this.catchAll) {
      entries.push(Object.freeze({ type: 'catch-all' as const, source: this.catchAll.source }));
    }

    return Object.freeze(entries);
  }

  /** Whether anything at all was registered. Used to decide if the adapter needs wiring up. */
  public get isEmpty(): boolean {
    return this.byPrototype.size === 0 && !this.catchAll;
  }

  /**
   * Finds the handler for a thrown value.
   *
   * @param error - Whatever was thrown. Not necessarily an `Error`.
   * @returns The handler, or `undefined` when nothing matches
   */
  public resolve(error: unknown): CatchEntry | undefined {
    // Callers run this from inside their own catch blocks; a hostile `constructor` getter or Proxy
    // must not turn the error path into a second throw.
    try {
      const identity = this.resolveByIdentity(error);

      if (this.brandEntry && (!identity || this.isBroaderThanHttpException(identity.type)) && isHttpException(error)) {
        return this.brandEntry;
      }

      if (identity) {
        return identity.entry;
      }
    } catch {
      // Unreadable value - only the catch-all can claim it.
    }

    return this.catchAll;
  }

  /** The typed `@Catch` an instance of `type` would reach by identity - no brand, no catch-all. */
  public matchClass(type: ExceptionType): IdentityMatch | undefined {
    return this.walk(type.prototype);
  }

  /** `@Catch(Error)` must not shadow `@Catch(HttpException)` for a branded exception from another class tree. */
  private isBroaderThanHttpException(type: ExceptionType): boolean {
    return HttpException.prototype instanceof type;
  }

  private resolveByIdentity(error: unknown): IdentityMatch | undefined {
    // `throw null`, `throw undefined` and primitives are not `instanceof` anything. They are not a
    // failure to handle - they are precisely what the catch-all exists for.
    if ((typeof error !== 'object' && typeof error !== 'function') || error === null) {
      return undefined;
    }

    const prototype: object | null = Object.getPrototypeOf(error);

    if (prototype === null) {
      return undefined;
    }

    const cached = this.identityCache.get(prototype);

    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const found = this.walk(prototype);

    // `null` records a miss, so a type nobody catches is not re-walked on every request.
    this.identityCache.set(prototype, found ?? null);

    return found;
  }

  private walk(prototype: object | null): IdentityMatch | undefined {
    for (let current = prototype; current !== null; current = Object.getPrototypeOf(current)) {
      const match = this.byPrototype.get(current);

      if (match) {
        return match;
      }
    }

    return undefined;
  }
}
