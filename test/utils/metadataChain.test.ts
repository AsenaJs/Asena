import { describe, expect, test } from 'bun:test';
import {
  defineTypedMetadata,
  getChainedTypedMetadata,
  getChainedTypedMetadataList,
  getOwnTypedMetadata,
  getPrototypeChainOf,
} from '../../lib/utils/typedMetadata';

// getChainedTypedMetadata is the single reader behind every inherited handler in the
// framework - routes, pages, @On and the message patterns all go through it. Its edge cases
// are cheap to test here and expensive to debug through a booted server.

const KEY = Symbol('test:chain');

const define = (target: any, value: Record<string, string>) => defineTypedMetadata(KEY, value, target);

// The readers are generic with nothing to infer from at these call sites, so the record type
// is written out. Left off, the result is `unknown`, `expect()` resolves to
// `Matchers<undefined>` and toEqual() stops comparing shapes at all.

describe('getChainedTypedMetadata', () => {
  test('merges the whole chain, nearest ancestor wins', () => {
    class Grandparent {}
    class Parent extends Grandparent {}
    class Child extends Parent {}

    define(Grandparent, { a: 'grandparent', shared: 'grandparent' });
    define(Parent, { b: 'parent', shared: 'parent' });
    define(Child, { c: 'child' });

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, Child)).toEqual({
      a: 'grandparent',
      b: 'parent',
      c: 'child',
      shared: 'parent',
    });
  });

  test('the leaf overrides an inherited entry with the same key', () => {
    class Base {}
    class Leaf extends Base {}

    define(Base, { handler: 'base' });
    define(Leaf, { handler: 'leaf' });

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, Leaf)).toEqual({ handler: 'leaf' });
  });

  test('returns the base entries when the leaf declares none, without handing back the stored record', () => {
    class Base {}
    class Leaf extends Base {}

    define(Base, { handler: 'base' });

    const merged = getChainedTypedMetadata<Record<string, string>>(KEY, Leaf);

    expect(merged).toEqual({ handler: 'base' });

    // A "fast path" that returns the stored object when only one class in the chain carries
    // entries would pass the assertion above and still let a caller corrupt the base class.
    merged.injected = 'should not stick';

    expect(getOwnTypedMetadata<Record<string, string>>(KEY, Base)).toEqual({ handler: 'base' });
  });

  test('returns an empty record for a class with no metadata anywhere', () => {
    class Bare {}

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, Bare)).toEqual({});
  });

  test('returns an empty record for a non-class target', () => {
    expect(getChainedTypedMetadata<Record<string, string>>(KEY, undefined)).toEqual({});
    expect(getChainedTypedMetadata<Record<string, string>>(KEY, null)).toEqual({});
    expect(getChainedTypedMetadata<Record<string, string>>(KEY, { not: 'a class' })).toEqual({});
  });

  // The important one: merging in place would write the subclass's entries into the base
  // class's stored record. Nothing would fail immediately - the leak only shows up on the
  // *second* subclass, which is exactly the kind of bug that survives a test suite.
  test('does not mutate the stored metadata', () => {
    class Base {}
    class Leaf extends Base {}

    define(Base, { fromBase: 'base' });
    define(Leaf, { fromLeaf: 'leaf' });

    const merged = getChainedTypedMetadata<Record<string, string>>(KEY, Leaf);

    merged.injected = 'should not stick';

    expect(getOwnTypedMetadata<Record<string, string>>(KEY, Base)).toEqual({ fromBase: 'base' });
    expect(getOwnTypedMetadata<Record<string, string>>(KEY, Leaf)).toEqual({ fromLeaf: 'leaf' });
    expect(getChainedTypedMetadata<Record<string, string>>(KEY, Leaf)).toEqual({ fromBase: 'base', fromLeaf: 'leaf' });
  });

  test('sibling subclasses do not see each other entries', () => {
    class SharedBase {}
    class FirstChild extends SharedBase {}
    class SecondChild extends SharedBase {}

    define(SharedBase, { common: 'base' });
    define(FirstChild, { first: 'first' });
    define(SecondChild, { second: 'second' });

    // Reading the first must not contaminate the base for the second.
    getChainedTypedMetadata(KEY, FirstChild);

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, SecondChild)).toEqual({
      common: 'base',
      second: 'second',
    });
  });

  test('terminates on a prototype chain rooted at null', () => {
    // `class X extends null` and Object.create(null) objects have no Object.prototype in their
    // chain, so a walker guarded only on Function.prototype/Object.prototype has to handle the
    // null terminator too - otherwise this hangs or throws rather than returning.
    const rootless = Object.create(null);

    defineTypedMetadata(KEY, { only: 'rootless' }, rootless);

    const derived = Object.create(rootless);

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, derived)).toEqual({ only: 'rootless' });
  });

  test('collects a four-level chain, including a level that declares nothing', () => {
    class L1 {}
    class L2 extends L1 {}
    class L3 extends L2 {}
    class L4 extends L3 {}

    define(L1, { first: 'l1' });
    // L2 deliberately declares nothing - a walker that stops at the first gap loses L1
    define(L3, { third: 'l3' });
    define(L4, { fourth: 'l4' });

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, L4)).toEqual({
      first: 'l1',
      third: 'l3',
      fourth: 'l4',
    });
  });

  test('collects through an anonymous class in the chain', () => {
    const WithHealth = (Base: any) => class extends Base {};

    class Plain {}

    const Mixed = WithHealth(Plain);

    class Leaf extends Mixed {}

    define(Plain, { plain: 'plain' });
    define(Mixed, { mixin: 'mixin' });
    define(Leaf, { leaf: 'leaf' });

    // An anonymous class expression is a real link and has to be walked like any other. Note
    // what this does NOT say: the metadata here is written by hand. TypeScript rejects a
    // decorator inside a class *expression* outright (TS1206) and Bun's transpiler drops it
    // silently, so `(Base) => class extends Base { @Get('/x') … }` carries no metadata at all
    // and registers nothing. The mixin shape that works is a named class *declaration*
    // returned from a factory - pinned end-to-end in server/web/RouteInheritance.test.ts.
    expect(getChainedTypedMetadata<Record<string, string>>(KEY, Leaf)).toEqual({
      plain: 'plain',
      mixin: 'mixin',
      leaf: 'leaf',
    });
  });

  test('is unaffected by metadata stored under a different key', () => {
    const OTHER = Symbol('test:other');

    class Base {}
    class Leaf extends Base {}

    define(Base, { fromBase: 'base' });
    defineTypedMetadata(OTHER, { unrelated: 'value' }, Leaf);

    expect(getChainedTypedMetadata<Record<string, string>>(KEY, Leaf)).toEqual({ fromBase: 'base' });
  });
});

// The list variant serves the keys where dropping an inherited entry is never the safe answer:
// class-level `middlewares`, @Override and @Hidden. It also has to work on a *prototype object*
// chain, because @Override is a PropertyDecorator and receives the prototype, not the class.
describe('getChainedTypedMetadataList', () => {
  const LIST = Symbol('test:chain:list');

  const defineList = (target: any, value: string[]) => defineTypedMetadata(LIST, value, target);

  test('unions the chain ancestors first', () => {
    class Base {}
    class Middle extends Base {}
    class Leaf extends Middle {}

    defineList(Base, ['auth']);
    defineList(Middle, ['audit']);
    defineList(Leaf, ['rateLimit']);

    expect(getChainedTypedMetadataList<string>(LIST, Leaf)).toEqual(['auth', 'audit', 'rateLimit']);
  });

  test('a subclass can add but never drop an inherited entry', () => {
    class Guarded {}
    class Subclass extends Guarded {}

    defineList(Guarded, ['auth']);
    // The empty array is the shape @Controller always writes when no middlewares are declared
    defineList(Subclass, []);

    expect(getChainedTypedMetadataList<string>(LIST, Subclass)).toEqual(['auth']);
  });

  test('removes duplicates by identity, keeping the earliest position', () => {
    const shared = { name: 'shared' };

    class Base {}
    class Leaf extends Base {}

    defineTypedMetadata(LIST, [shared, { name: 'baseOnly' }], Base);
    defineTypedMetadata(LIST, [shared, { name: 'leafOnly' }], Leaf);

    const merged = getChainedTypedMetadataList<{ name: string }>(LIST, Leaf);

    expect(merged.map((entry) => entry.name)).toEqual(['shared', 'baseOnly', 'leafOnly']);
  });

  test('walks a prototype-object chain, which is where @Override writes', () => {
    class Base {
      public handle() {}
    }
    class Leaf extends Base {
      public other() {}
    }

    defineList(Base.prototype, ['handle']);
    defineList(Leaf.prototype, ['other']);

    // Read off an instance, exactly as PrepareMiddlewareService does
    expect(getChainedTypedMetadataList<string>(LIST, new Leaf())).toEqual(['handle', 'other']);
  });

  test('returns an empty array when the chain carries none', () => {
    class Bare {}

    expect(getChainedTypedMetadataList(LIST, Bare)).toEqual([]);
    expect(getChainedTypedMetadataList(LIST, undefined)).toEqual([]);
  });
});

describe('getPrototypeChainOf', () => {
  test('orders a constructor chain ancestors first', () => {
    class A {}
    class B extends A {}
    class C extends B {}

    expect(getPrototypeChainOf(C)).toEqual([A, B, C]);
  });

  test('orders a prototype chain ancestors first and stops before Object.prototype', () => {
    class A {}
    class B extends A {}

    expect(getPrototypeChainOf(B.prototype)).toEqual([A.prototype, B.prototype]);
  });

  test('returns an empty chain for null and undefined', () => {
    expect(getPrototypeChainOf(null)).toEqual([]);
    expect(getPrototypeChainOf(undefined)).toEqual([]);
  });
});
