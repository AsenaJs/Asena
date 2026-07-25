import { describe, expect, test } from 'bun:test';
import { PatternHandlerIndex } from '../../../lib/server/event';

describe('PatternHandlerIndex', () => {
  test('should collect exact matches first, then wildcard matches, in registration order', () => {
    const index = new PatternHandlerIndex<string>();

    index.add('user.*', 'wildcard-1');
    index.add('user.created', 'exact-1');
    index.add('user.created', 'exact-2');
    index.add('*.created', 'wildcard-2');

    expect(index.collect('user.created')).toEqual(['exact-1', 'exact-2', 'wildcard-1', 'wildcard-2']);
    expect(index.collect('user.deleted')).toEqual(['wildcard-1']);
    expect(index.collect('order.created')).toEqual(['wildcard-2']);
  });

  test('should return empty array when nothing matches', () => {
    const index = new PatternHandlerIndex<string>();

    index.add('user.created', 'exact');

    expect(index.collect('order.created')).toEqual([]);
  });

  test('should remove entries by identity', () => {
    const index = new PatternHandlerIndex<string>();

    index.add('user.created', 'a');
    index.add('user.created', 'b');
    index.add('user.*', 'w');

    expect(index.remove('user.created', 'a')).toBe(true);
    expect(index.collect('user.created')).toEqual(['b', 'w']);

    expect(index.remove('user.*', 'w')).toBe(true);
    expect(index.collect('user.created')).toEqual(['b']);

    // Not registered / already removed
    expect(index.remove('user.created', 'a')).toBe(false);
    expect(index.remove('missing.pattern', 'x')).toBe(false);
  });

  test('should report emptiness and support clear', () => {
    const index = new PatternHandlerIndex<string>();

    expect(index.isEmpty).toBe(true);

    index.add('user.created', 'a');
    expect(index.isEmpty).toBe(false);

    index.remove('user.created', 'a');
    expect(index.isEmpty).toBe(true);

    index.add('user.*', 'w');
    index.add('order.created', 'b');
    index.clear();

    expect(index.isEmpty).toBe(true);
    expect(index.collect('user.created')).toEqual([]);
  });

  test('should support universal wildcard', () => {
    const index = new PatternHandlerIndex<string>();

    index.add('*', 'all');

    expect(index.collect('anything')).toEqual(['all']);
    expect(index.collect('deeply.nested.event')).toEqual(['all']);
  });

  describe('patterns()', () => {
    test('should be empty for a fresh index', () => {
      expect(new PatternHandlerIndex<string>().patterns()).toEqual([]);
    });

    test('should list exact patterns first, then wildcards, in registration order', () => {
      const index = new PatternHandlerIndex<string>();

      index.add('user.*', 'w1');
      index.add('user.created', 'a');
      index.add('order.created', 'b');
      index.add('*.deleted', 'w2');

      expect(index.patterns()).toEqual(['user.created', 'order.created', 'user.*', '*.deleted']);
    });

    test('should reflect remove() and clear()', () => {
      const index = new PatternHandlerIndex<string>();

      index.add('user.created', 'a');
      index.add('user.*', 'w');

      index.remove('user.created', 'a');
      expect(index.patterns()).toEqual(['user.*']);

      index.clear();
      expect(index.patterns()).toEqual([]);
    });
  });
});
