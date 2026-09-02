import { getOwnTypedMetadata, getPrototypeChainOf } from '../utils/typedMetadata';
import { AUTH_GUARD_CLASS_KEY, AUTH_GUARD_METHODS_KEY } from './constants';
import type { GuardMark } from './types';

/** The guard marks a class carries after inheritance: the nearest class mark and, per method name, the nearest declaration. */
export interface CollectedGuardMetadata {
  classMark?: GuardMark;
  methods: Map<string, GuardMark>;
}

/**
 * Collects the guard marks of `Class` and its ancestors, walking the prototype chain
 * ancestors-first so the most-derived declaration wins per slot - override semantics,
 * deliberately unlike `@Transaction`'s accumulation: a subclass `@Public` cancels an
 * inherited `@Protected` instead of adding to it.
 *
 * The returned map is always fresh; mutating it never writes back into stored metadata.
 */
export function collectGuardMetadata(Class: Function): CollectedGuardMetadata {
  const collected: CollectedGuardMetadata = { methods: new Map() };

  for (const link of getPrototypeChainOf(Class)) {
    const classMark = getOwnTypedMetadata<GuardMark>(AUTH_GUARD_CLASS_KEY, link);

    if (classMark) {
      collected.classMark = classMark;
    }

    const methods = getOwnTypedMetadata<Map<string, GuardMark>>(AUTH_GUARD_METHODS_KEY, link);

    if (methods) {
      for (const [method, mark] of methods) {
        collected.methods.set(method, mark);
      }
    }
  }

  return collected;
}

/**
 * The mark enforcement must apply for a handler: the method's own mark when present,
 * otherwise the class mark. `roles` never flow down from the class mark - `@Protected()`
 * on a `@Roles('admin')` controller means "any session", which is the only reading visible
 * at the method. `provider` does flow down: which system authenticates is a property of the
 * controller, so `@Roles('admin')` under `@Protected({ provider: 'jwt' })` still asks `jwt`.
 */
export function effectiveGuardMark(collected: CollectedGuardMetadata, method: string): GuardMark | undefined {
  const methodMark = collected.methods.get(method);

  if (!methodMark) {
    return collected.classMark;
  }

  if (methodMark.access === 'protected' && methodMark.provider === undefined && collected.classMark?.provider) {
    return { ...methodMark, provider: collected.classMark.provider };
  }

  return methodMark;
}
