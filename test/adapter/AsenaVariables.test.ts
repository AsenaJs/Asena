import { describe, expect, test } from 'bun:test';
import { TestContextWrapper } from '../utils/TestContextWrapper';

// Test-specific augmentation
declare module '../../lib/adapter/AsenaContext' {
  interface AsenaVariables {
    testUser: { id: string; name: string };
    testCount: number;
  }
}

describe('AsenaVariables - Generic Context Types', () => {
  const createContext = () => new TestContextWrapper();

  test('getValue returns stored value', () => {
    const ctx = createContext();

    ctx.setValue('testUser', { id: '1', name: 'Test' });

    const user = ctx.getValue('testUser');

    expect(user.id).toBe('1');
    expect(user.name).toBe('Test');
  });

  test('setValue enforces correct type for augmented key', () => {
    const ctx = createContext();

    ctx.setValue('testCount', 42);

    expect(ctx.getValue('testCount')).toBe(42);
  });

  test('setValue rejects wrong type for augmented key', () => {
    const ctx = createContext();

    // @ts-expect-error - number is not { id: string; name: string }
    ctx.setValue('testUser', 42);
  });

  test('getValue with explicit generic still works (backward compat)', () => {
    const ctx = createContext();

    ctx.setValue('dynamic', 'hello');

    const val = ctx.getValue<string>('dynamic');

    expect(val).toBe('hello');
  });

  test('unknown key does not cause compile error', () => {
    const ctx = createContext();

    ctx.setValue('randomKey', 'anything');
    const val = ctx.getValue('randomKey');

    expect(val).toBe('anything');
  });

  test('getValue returns undefined for nonexistent key', () => {
    const ctx = createContext();

    const val = ctx.getValue('nonexistent');

    expect(val).toBeUndefined();
  });

  test('setValue overwrites previous value', () => {
    const ctx = createContext();

    ctx.setValue('testCount', 1);
    ctx.setValue('testCount', 2);

    expect(ctx.getValue('testCount')).toBe(2);
  });

  test('multiple augmented keys work independently', () => {
    const ctx = createContext();

    ctx.setValue('testUser', { id: '1', name: 'Alice' });
    ctx.setValue('testCount', 99);

    expect(ctx.getValue('testUser').name).toBe('Alice');
    expect(ctx.getValue('testCount')).toBe(99);
  });
});
