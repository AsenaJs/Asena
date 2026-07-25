import { describe, expect, test } from 'bun:test';
import { createDeepMock } from '../../lib/test';

describe('createDeepMock', () => {
  describe('property access', () => {
    test('should return a callable function for any property', () => {
      const deepMock = createDeepMock();

      expect(typeof deepMock.anything).toBe('function');
      expect(() => deepMock.anything()).not.toThrow();
    });

    test('should memoize property access', () => {
      const deepMock = createDeepMock();

      expect(deepMock.broadcast).toBe(deepMock.broadcast);
    });
  });

  describe('call tracking', () => {
    test('should track calls through the proxy', () => {
      const deepMock = createDeepMock();

      deepMock.foo('a', 1);

      expect(deepMock.foo).toHaveBeenCalledTimes(1);
      expect(deepMock.foo).toHaveBeenCalledWith('a', 1);
    });

    test('should accumulate call counts across separate property accesses', () => {
      const deepMock = createDeepMock();

      deepMock.foo('first');
      deepMock.foo('second');

      expect(deepMock.foo).toHaveBeenCalledTimes(2);
    });
  });

  describe('nested chains', () => {
    test('should support chained calls', () => {
      const deepMock = createDeepMock();

      const namespace = deepMock.namespace('/chat');

      expect(typeof namespace.broadcast).toBe('function');
      expect(() => namespace.broadcast({ text: 'hello' })).not.toThrow();
      expect(namespace.broadcast).toHaveBeenCalledWith({ text: 'hello' });
    });

    test('should memoize call results regardless of arguments', () => {
      const deepMock = createDeepMock();

      expect(deepMock.namespace('/a')).toBe(deepMock.namespace('/b'));
    });
  });

  describe('await safety', () => {
    test('should not be treated as a thenable', () => {
      const deepMock = createDeepMock();

      expect(deepMock.then).toBeUndefined();
      expect(deepMock.catch).toBeUndefined();
      expect(deepMock.finally).toBeUndefined();
    });

    test('should resolve when awaited directly', async () => {
      const deepMock = createDeepMock();

      expect(await deepMock).toBe(deepMock);
    });

    test('should resolve when a call result is awaited', async () => {
      const deepMock = createDeepMock();

      // Must not hang even though the default return value is another deep mock
      await deepMock.broadcast({ text: 'hello' });

      expect(deepMock.broadcast).toHaveBeenCalledTimes(1);
    });
  });

  describe('well-known keys', () => {
    test('should not generate mocks for symbols', () => {
      const deepMock = createDeepMock();

      expect(deepMock[Symbol.iterator]).toBeUndefined();
      expect(deepMock[Symbol.toPrimitive]).toBeUndefined();
    });

    test('should not throw on string conversion', () => {
      const deepMock = createDeepMock();

      expect(() => String(deepMock)).not.toThrow();
    });

    test('should not throw on JSON serialization', () => {
      const deepMock = createDeepMock();

      expect(() => JSON.stringify(deepMock)).not.toThrow();
    });
  });

  describe('mock configuration', () => {
    test('should support mockReturnValue', () => {
      const deepMock = createDeepMock();

      deepMock.getSocketCount.mockReturnValue(5);

      expect(deepMock.getSocketCount()).toBe(5);
    });

    test('should support mockResolvedValue', async () => {
      const deepMock = createDeepMock();

      deepMock.findById.mockResolvedValue({ id: '1' });

      expect(await deepMock.findById('1')).toEqual({ id: '1' });
    });
  });
});
