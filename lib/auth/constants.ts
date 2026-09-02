/** Strategy key an auth provider class registers under (`@Implements` / `container.resolveStrategy`). */
export const AUTH_PROVIDER_KEY = 'AsenaAuthProvider';

/** Context key the resolved session travels under (`ctx.getValue` / `ctx.setValue`). */
export const AUTH_SESSION_CONTEXT_KEY = 'authSession';

/** Metadata key holding the single class-level `GuardMark` on a constructor. */
export const AUTH_GUARD_CLASS_KEY = Symbol.for('asena:auth:guard:class');

/** Metadata key holding the per-method `Map<string, GuardMark>` on a constructor. */
export const AUTH_GUARD_METHODS_KEY = Symbol.for('asena:auth:guard:methods');
