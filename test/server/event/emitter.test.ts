import { describe, expect, test } from 'bun:test';
import { emitter } from '../../../lib/server/event';
import { ICoreServiceNames } from '../../../lib/ioc';

describe('emitter utility', () => {
  test('should return EVENT_EMITTER service key', () => {
    const result = emitter();
    expect(result).toBe(ICoreServiceNames.EVENT_EMITTER);
  });

  test('should be a function', () => {
    expect(typeof emitter).toBe('function');
  });

  test('should return a string', () => {
    const result = emitter();
    expect(typeof result).toBe('string');
  });
});
