import { describe, expect, test } from 'bun:test';
import { matchesEventPattern } from '../../../lib/server/event';

describe('Event Pattern Matcher', () => {
  describe('Exact Match', () => {
    test('should match exact event names', () => {
      expect(matchesEventPattern('user.created', 'user.created')).toBe(true);
      expect(matchesEventPattern('download.complete', 'download.complete')).toBe(true);
      expect(matchesEventPattern('app.start', 'app.start')).toBe(true);
    });

    test('should not match different event names', () => {
      expect(matchesEventPattern('user.created', 'user.updated')).toBe(false);
      expect(matchesEventPattern('download.start', 'upload.start')).toBe(false);
    });
  });

  describe('Single Wildcard (*)', () => {
    test('should match all events with * pattern', () => {
      expect(matchesEventPattern('user.created', '*')).toBe(true);
      expect(matchesEventPattern('download.complete', '*')).toBe(true);
      expect(matchesEventPattern('any.event.at.all', '*')).toBe(true);
    });
  });

  describe('Prefix Wildcard (download.*)', () => {
    test('should match events with matching prefix', () => {
      expect(matchesEventPattern('download.start', 'download.*')).toBe(true);
      expect(matchesEventPattern('download.complete', 'download.*')).toBe(true);
      expect(matchesEventPattern('download.progress', 'download.*')).toBe(true);
    });

    test('should not match events with different prefix', () => {
      expect(matchesEventPattern('upload.start', 'download.*')).toBe(false);
      expect(matchesEventPattern('user.created', 'download.*')).toBe(false);
    });

    test('should not match exact prefix without suffix', () => {
      expect(matchesEventPattern('download', 'download.*')).toBe(false);
    });

    test('should match nested paths with prefix wildcard', () => {
      expect(matchesEventPattern('download.file.complete', 'download.*')).toBe(true);
      expect(matchesEventPattern('download.image.thumbnail.ready', 'download.*')).toBe(true);
    });
  });

  describe('Suffix Wildcard (*.complete)', () => {
    test('should match events with matching suffix', () => {
      expect(matchesEventPattern('download.complete', '*.complete')).toBe(true);
      expect(matchesEventPattern('upload.complete', '*.complete')).toBe(true);
      expect(matchesEventPattern('processing.complete', '*.complete')).toBe(true);
    });

    test('should not match events with different suffix', () => {
      expect(matchesEventPattern('download.start', '*.complete')).toBe(false);
      expect(matchesEventPattern('user.created', '*.complete')).toBe(false);
    });

    test('should not match exact suffix without prefix', () => {
      expect(matchesEventPattern('complete', '*.complete')).toBe(false);
    });

    test('should match nested paths with suffix wildcard', () => {
      expect(matchesEventPattern('file.download.complete', '*.complete')).toBe(true);
      expect(matchesEventPattern('image.thumbnail.processing.complete', '*.complete')).toBe(true);
    });
  });

  describe('Middle Wildcard (user.*.created)', () => {
    test('should match events with wildcard in the middle', () => {
      expect(matchesEventPattern('user.admin.created', 'user.*.created')).toBe(true);
      expect(matchesEventPattern('user.guest.created', 'user.*.created')).toBe(true);
      expect(matchesEventPattern('user.moderator.created', 'user.*.created')).toBe(true);
    });

    test('should not match events with different prefix or suffix', () => {
      expect(matchesEventPattern('user.admin.updated', 'user.*.created')).toBe(false);
      expect(matchesEventPattern('post.admin.created', 'user.*.created')).toBe(false);
    });

    test('should match nested middle segments', () => {
      expect(matchesEventPattern('user.admin.role.created', 'user.*.created')).toBe(true);
      expect(matchesEventPattern('user.guest.profile.picture.created', 'user.*.created')).toBe(true);
    });
  });

  describe('Multiple Wildcards', () => {
    test('should match patterns with multiple wildcards', () => {
      expect(matchesEventPattern('app.module.user.created', 'app.*.*.created')).toBe(true);
      expect(matchesEventPattern('app.module.post.created', 'app.*.*.created')).toBe(true);
      expect(matchesEventPattern('app.service.auth.created', 'app.*.*.created')).toBe(true);
    });

    test('should match patterns with wildcard at start and end', () => {
      expect(matchesEventPattern('app.user.action.complete', '*.action.*')).toBe(true);
      expect(matchesEventPattern('service.action.started', '*.action.*')).toBe(true);
    });

    test('should match nested segments with multiple wildcards', () => {
      expect(matchesEventPattern('app.module.service.user.role.created', 'app.*.*.created')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty strings', () => {
      expect(matchesEventPattern('', '')).toBe(true);
      expect(matchesEventPattern('user.created', '')).toBe(false);
      expect(matchesEventPattern('', 'user.created')).toBe(false);
    });

    test('should handle single segment events', () => {
      expect(matchesEventPattern('start', 'start')).toBe(true);
      expect(matchesEventPattern('start', '*')).toBe(true);
      expect(matchesEventPattern('start', 'start.*')).toBe(false);
      expect(matchesEventPattern('start', '*.start')).toBe(false);
    });

    test('should handle events with only dots', () => {
      expect(matchesEventPattern('...', '*')).toBe(true);
      expect(matchesEventPattern('a..b', 'a.*.b')).toBe(true);
    });

    test('should be case-sensitive', () => {
      expect(matchesEventPattern('user.created', 'user.created')).toBe(true);
      expect(matchesEventPattern('user.created', 'User.Created')).toBe(false);
      expect(matchesEventPattern('User.Created', 'user.created')).toBe(false);
    });

    test('should handle special characters', () => {
      expect(matchesEventPattern('user:created', 'user:created')).toBe(true);
      expect(matchesEventPattern('user-created', 'user-created')).toBe(true);
      expect(matchesEventPattern('user_created', 'user_created')).toBe(true);
    });
  });

  describe('Performance Patterns', () => {
    test('should efficiently match long event names', () => {
      const longEvent = 'app.module.service.controller.action.user.profile.picture.upload.complete';
      const longPattern = 'app.*.*.*.*.*.profile.*.upload.*';

      expect(matchesEventPattern(longEvent, longPattern)).toBe(true);
    });

    test('should efficiently match patterns with many segments', () => {
      const event = 'a.b.c.d.e.f.g.h.i.j';
      const pattern = 'a.*.*.*.*.*.*.*.*.j';

      expect(matchesEventPattern(event, pattern)).toBe(true);
    });
  });
});
