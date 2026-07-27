import { defineMetadata, getMetadata, getOwnMetadata } from 'reflect-metadata/no-conflict';

export const getTypedMetadata = <T>(key: string | symbol, target: any): T | undefined => {
  return getMetadata(key, target);
};

export const getOwnTypedMetadata = <T>(key: string | symbol, target: any): T | undefined => {
  return getOwnMetadata(key, target);
};

/**
 * Collects the prototype chain of `target`, most distant ancestor first.
 *
 * Accepts both shapes the framework stores metadata on:
 * - a **class constructor** (`class B extends A` -> `[A, B]`), which is where class decorators
 *   and every method-level decorator write (`target.constructor`);
 * - a **prototype object** (`B.prototype` -> `[A.prototype, B.prototype]`), which is where
 *   property decorators write - `@Override` receives the prototype, not the constructor.
 *
 * Ancestors-first is the order every caller wants: merging in that order lets the nearest
 * class override an inherited entry while keeping the rest.
 *
 * @param target - A class constructor, a prototype object, or anything else (yields `[]`)
 * @returns The chain, ancestors first, excluding `Function.prototype` / `Object.prototype`
 */
export const getPrototypeChainOf = (target: any): any[] => {
  if (target === null || target === undefined) {
    return [];
  }

  const chain: any[] = [];

  // A constructor chain terminates at Function.prototype, an object chain at Object.prototype
  // or at null (`Object.create(null)`). Guarding on all three keeps one walker for both shapes.
  for (
    let current = target;
    current !== null && current !== undefined && current !== Function.prototype && current !== Object.prototype;
  ) {
    chain.unshift(current);
    current = Object.getPrototypeOf(current);
  }

  return chain;
};

/**
 * Reads an array-shaped metadata key across the prototype chain and unions it.
 *
 * The list counterpart of {@link getChainedTypedMetadata}. Order is preserved
 * ancestors-first and duplicates are removed by identity, so a subclass can only ever *add*
 * to what it inherits. That direction matters for the keys this serves - class-level
 * `middlewares`, `@Override`, `@Hidden` - because every one of them is a guard or a
 * suppression, and silently dropping an inherited one is never the safe answer.
 *
 * @param key - Metadata key holding an array
 * @param target - A class constructor or a prototype object
 * @returns The unioned array, `[]` when the chain carries none
 */
export const getChainedTypedMetadataList = <T>(key: string | symbol, target: any): T[] => {
  const merged: T[] = [];

  for (const link of getPrototypeChainOf(target)) {
    const own = getOwnMetadata(key, link) as T[] | undefined;

    if (!own) continue;

    for (const entry of own) {
      if (!merged.includes(entry)) {
        merged.push(entry);
      }
    }
  }

  return merged;
};

/**
 * Reads a record-shaped metadata key across the whole prototype chain and merges it.
 *
 * Method-level decorators write their metadata to the class where the *method is declared*
 * (`target.constructor`), so a handler inherited from a base class lives on that base class.
 * Neither of the other two readers gives the right answer for those:
 * - `getOwnTypedMetadata` never sees the base class at all, so the handler is silently lost.
 * - `getTypedMetadata` returns the *nearest* ancestor's record whole, so a single entry on
 *   the subclass shadows every inherited one.
 *
 * This walks from the most distant ancestor down to the class itself and merges per key, so
 * a subclass overrides an inherited entry by method name and keeps the rest. That matches
 * Spring (`MethodIntrospector.selectMethods` scans the hierarchy) and JAX-RS §3.6.
 *
 * The result is always a fresh object: merging in place would write the subclass's entries
 * into the base class's stored record, leaking them into every sibling subclass.
 *
 * @param key - Metadata key holding a `{ [methodName]: value }` record
 * @param target - A class constructor
 * @returns The merged record, `{}` when the chain carries none
 */
export const getChainedTypedMetadata = <T extends Record<string, any>>(key: string | symbol, target: any): T => {
  const merged = {} as Record<string, any>;

  for (const link of getPrototypeChainOf(target)) {
    Object.assign(merged, getOwnMetadata(key, link) || {});
  }

  return merged as T;
};

export const defineTypedMetadata = <T>(key: string | symbol, value: T, target: any, sym?: string | symbol): void => {
  if (sym === undefined) {
    defineMetadata(key, value, target);
    return;
  }

  defineMetadata(key, value, target, sym);
};
