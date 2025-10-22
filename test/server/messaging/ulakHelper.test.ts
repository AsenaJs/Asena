import { describe, expect, test } from 'bun:test';
import { ulak } from '../../../lib/server/messaging/Ulak';
import { ICoreServiceNames } from '../../../lib/ioc';

describe('ulak() helper function', () => {
  test('should return tuple with correct service name', () => {
    const result = ulak('/test');

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBe(ICoreServiceNames.__ULAK__);
  });

  test('should return expression function that returns scoped namespace', () => {
    const result = ulak('/test');
    const [, expression] = result;

    expect(typeof expression).toBe('function');
  });

  test('should preserve namespace type in expression', () => {
    const result = ulak('/chat');
    const [serviceName, expression] = result;

    expect(serviceName).toBe(ICoreServiceNames.__ULAK__);

    // Mock Ulak instance
    const mockUlak = {
      namespace: (path: string) => ({
        path,
        broadcast: async () => {},
        to: async () => {},
        toSocket: async () => {},
        toMany: async () => {},
        getSocketCount: () => 0,
      }),
    };

    const scopedNamespace = expression(mockUlak as any);

    expect(scopedNamespace.path).toBe('/chat');
  });

  test('should work with different namespace paths', () => {
    const testCases = ['/chat', '/notifications', '/admin', '/api/v1/events'];

    for (const namespace of testCases) {
      const [serviceName, expression] = ulak(namespace);

      expect(serviceName).toBe(ICoreServiceNames.__ULAK__);
      expect(typeof expression).toBe('function');

      // Mock Ulak
      const mockUlak = {
        namespace: (path: string) => ({ path }),
      };

      const result = expression(mockUlak as any);

      expect(result.path).toBe(namespace);
    }
  });

  test('should return readonly tuple', () => {
    const result = ulak('/test');

    // TypeScript should enforce readonly, but we can check it's an array
    expect(Object.isFrozen(result)).toBe(false); // as const makes it readonly in TS, not frozen in JS
    expect(result.length).toBe(2);
  });

  test('should be compatible with @Inject decorator tuple syntax', () => {
    const injection = ulak('/test');

    // Structure expected by @Inject decorator
    expect(Array.isArray(injection)).toBe(true);
    expect(injection.length).toBe(2);
    expect(typeof injection[0]).toBe('string'); // Service name
    expect(typeof injection[1]).toBe('function'); // Expression function
  });
});
