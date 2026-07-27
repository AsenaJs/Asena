import { describe, expect, test } from 'bun:test';
import { ComponentConstants } from '../../lib/ioc/constants';
import { defineTypedMetadata, getTypedMetadata } from '../../lib/utils/typedMetadata';
import { Service } from '../../lib/server/decorators';

describe('Symbol Keys Security', () => {
  // Enumerated rather than listed by hand. The hand-written list had drifted: it named eight
  // keys no decorator wrote and no reader read, and it silently omitted every key added since
  // it was written. Reading the class means a new key is covered the moment it exists.
  const allKeys = Object.getOwnPropertyNames(ComponentConstants)
    .filter((name) => !['length', 'name', 'prototype'].includes(name))
    .map((name) => [name, (ComponentConstants as any)[name]] as const);

  test('should have unique Symbol keys', () => {
    const values = allKeys.map(([, value]) => value);

    expect(new Set(values).size).toBe(values.length);
  });

  test('all ComponentConstants keys should be Symbols', () => {
    expect(allKeys.length).toBeGreaterThan(0);

    for (const [name, value] of allKeys) {
      expect(typeof value, `${name} must be a Symbol, not a string key`).toBe('symbol');
    }
  });

  test('should prevent external manipulation with string keys', () => {
    @Service('TestService')
    class TestClass {}

    // Try to manipulate with string key (old way)
    defineTypedMetadata('component:name', 'HackedName', TestClass);

    // Read with Symbol key - should be unchanged
    const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestClass);

    // Original decorator value should remain intact
    expect(name).toBe('TestService');
    expect(name).not.toBe('HackedName');
  });

  test('Symbol-based metadata should not conflict with string-based metadata', () => {
    class TestClass {}

    // Set with Symbol key
    defineTypedMetadata(ComponentConstants.NameKey, 'SymbolValue', TestClass);

    // Set with string key (same description)
    defineTypedMetadata('component:name', 'StringValue', TestClass);

    // Both should exist independently
    const symbolValue = getTypedMetadata<string>(ComponentConstants.NameKey, TestClass);
    const stringValue = getTypedMetadata<string>('component:name' as any, TestClass);

    expect(symbolValue).toBe('SymbolValue');
    expect(stringValue).toBe('StringValue');
    expect(symbolValue).not.toBe(stringValue);
  });

  test('Symbol uniqueness across different instances', () => {
    const sym1 = ComponentConstants.NameKey;
    const sym2 = ComponentConstants.NameKey;

    // Same reference
    expect(sym1).toBe(sym2);

    // But creating new Symbol with same description creates different Symbol
    const sym3 = Symbol('component:name');

    expect(sym1).not.toBe(sym3);
    expect(typeof sym1).toBe(typeof sym3);
  });

  test('Symbol keys should be collision-free between components', () => {
    @Service('ServiceA')
    class ServiceA {}

    @Service('ServiceB')
    class ServiceB {}

    const nameA = getTypedMetadata<string>(ComponentConstants.NameKey, ServiceA);
    const nameB = getTypedMetadata<string>(ComponentConstants.NameKey, ServiceB);

    expect(nameA).toBe('ServiceA');
    expect(nameB).toBe('ServiceB');

    // No collision even though using same Symbol key
    expect(nameA).not.toBe(nameB);
  });

  test('external code cannot guess Symbol value', () => {
    class TestClass {}

    // Set with ComponentConstants Symbol
    defineTypedMetadata(ComponentConstants.NameKey, 'RealValue', TestClass);

    // Try to guess with new Symbol (even with same description)
    const guessedSymbol = Symbol('component:name');
    const guessedValue = getTypedMetadata<string>(guessedSymbol, TestClass);

    expect(guessedValue).toBeUndefined();

    // Real value is still accessible with correct Symbol
    const realValue = getTypedMetadata<string>(ComponentConstants.NameKey, TestClass);

    expect(realValue).toBe('RealValue');
  });

  test('Symbol.for() vs Symbol() - our implementation uses Symbol()', () => {
    // Symbol.for() creates global symbols (bad for security)
    const globalSym1 = Symbol.for('test');
    const globalSym2 = Symbol.for('test');

    expect(globalSym1).toBe(globalSym2 as any); // Same reference

    // Symbol() creates unique symbols (good for security)
    const uniqueSym1 = Symbol('test');
    const uniqueSym2 = Symbol('test');

    expect(uniqueSym1).not.toBe(uniqueSym2); // Different references

    // Verify our ComponentConstants uses Symbol() not Symbol.for()
    const key1 = ComponentConstants.NameKey;
    const key2 = Symbol.for('component:name');

    expect(key1).not.toBe(key2);
  });
});

describe('Symbol Keys Type Safety', () => {
  test('TypeScript should accept Symbol keys in typedMetadata functions', () => {
    class TestClass {}

    // This should compile without errors
    defineTypedMetadata(ComponentConstants.NameKey, 'TestValue', TestClass);
    defineTypedMetadata(ComponentConstants.ScopeKey, 'singleton', TestClass);

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestClass);
    const scope = getTypedMetadata<string>(ComponentConstants.ScopeKey, TestClass);

    expect(name).toBe('TestValue');
    expect(scope).toBe('singleton');
  });

  test('should work with both string and Symbol keys (backward compatibility check)', () => {
    class TestClass {}

    // Symbol key
    defineTypedMetadata(ComponentConstants.NameKey, 'SymbolName', TestClass);

    // String key (legacy support via union type)
    defineTypedMetadata('_legacyKey', 'StringName', TestClass);

    const symbolValue = getTypedMetadata<string>(ComponentConstants.NameKey, TestClass);
    const stringValue = getTypedMetadata<string>('_legacyKey', TestClass);

    expect(symbolValue).toBe('SymbolName');
    expect(stringValue).toBe('StringName');
  });
});
