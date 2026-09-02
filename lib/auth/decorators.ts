import { defineTypedMetadata, getOwnTypedMetadata } from '../utils/typedMetadata';
import { AUTH_GUARD_CLASS_KEY, AUTH_GUARD_METHODS_KEY } from './constants';
import type { GuardMark, ProtectedOptions } from './types';

const recordClassMark = (mark: GuardMark, ctor: Function): void => {
  defineTypedMetadata<GuardMark>(AUTH_GUARD_CLASS_KEY, mark, ctor);
};

const recordMethodMark = (mark: GuardMark, ctor: Function, method: string): void => {
  const methods = getOwnTypedMetadata<Map<string, GuardMark>>(AUTH_GUARD_METHODS_KEY, ctor) || new Map();

  methods.set(method, mark);
  defineTypedMetadata<Map<string, GuardMark>>(AUTH_GUARD_METHODS_KEY, methods, ctor);
};

const markTarget = (mark: GuardMark, target: any, propertyKey?: string | symbol): void => {
  if (propertyKey === undefined) {
    recordClassMark(mark, target);
  } else {
    recordMethodMark(mark, target.constructor, String(propertyKey));
  }
};

/**
 * Marks a controller class or a single handler as requiring an authenticated session,
 * optionally naming the provider that must resolve it. On a method it overrides the
 * class mark for that method alone.
 *
 * When several guard decorators stack on the same target, the one applied last wins
 * entirely - legacy decorators apply bottom-up, so the decorator written *above* the
 * other in the source replaces it, mark for mark, without merging.
 */
export function Protected(options: ProtectedOptions = {}): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    markTarget({ access: 'protected', ...options }, target, propertyKey);
  };
}

/**
 * Marks a controller class or a single handler as open to anonymous requests, cancelling
 * an inherited `@Protected` / `@Roles` mark. Stacked marks: see {@link Protected}.
 */
export function Public(): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    markTarget({ access: 'public' }, target, propertyKey);
  };
}

/**
 * Marks a controller class or a single handler as requiring any of the given roles
 * (any-of semantics); implies `access: 'protected'`. Throws at decoration time when
 * called with no roles. Stacked marks: see {@link Protected}.
 */
export function Roles(...roles: string[]): ClassDecorator & MethodDecorator {
  if (roles.length === 0) {
    throw new Error('@Roles requires at least one role.');
  }

  return (target: any, propertyKey?: string | symbol) => {
    markTarget({ access: 'protected', roles: [...roles] }, target, propertyKey);
  };
}
