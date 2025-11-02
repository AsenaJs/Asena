import { describe, expect, test } from 'bun:test';
import { ComponentConstants } from '../../../lib/ioc';
import type {
  EventHandler,
  EventHandlerMetadata,
  EventServiceParams,
  EventSubscription,
  OnParams,
} from '../../../lib/server/event';

describe('Event System Types', () => {
  describe('ComponentConstants', () => {
    test('should have EventHandlersKey symbol', () => {
      expect(typeof ComponentConstants.EventHandlersKey).toBe('symbol');
      expect(ComponentConstants.EventHandlersKey.toString()).toContain('event:handlers');
    });

    test('should have EventPrefixKey symbol', () => {
      expect(typeof ComponentConstants.EventPrefixKey).toBe('symbol');
      expect(ComponentConstants.EventPrefixKey.toString()).toContain('event:prefix');
    });
  });

  describe('EventServiceParams', () => {
    test('should allow creating valid EventServiceParams', () => {
      const params: EventServiceParams = {
        prefix: 'download',
        name: 'DownloadEventService',
      };

      expect(params.prefix).toBe('download');
      expect(params.name).toBe('DownloadEventService');
    });

    test('should allow optional prefix', () => {
      const params: EventServiceParams = {
        name: 'EventService',
      };

      expect(params.prefix).toBeUndefined();
    });
  });

  describe('OnParams', () => {
    test('should allow creating valid OnParams', () => {
      const params: OnParams = {
        event: 'download.complete',
        skip: false,
      };

      expect(params.event).toBe('download.complete');
      expect(params.skip).toBe(false);
    });

    test('should allow optional skip parameter', () => {
      const params: OnParams = {
        event: 'user.created',
      };

      expect(params.event).toBe('user.created');
      expect(params.skip).toBeUndefined();
    });

    test('should support wildcard patterns', () => {
      const patterns: OnParams[] = [
        { event: '*' },
        { event: 'download.*' },
        { event: '*.complete' },
        { event: 'user.*.created' },
      ];

      expect(patterns[0].event).toBe('*');
      expect(patterns[1].event).toBe('download.*');
      expect(patterns[2].event).toBe('*.complete');
      expect(patterns[3].event).toBe('user.*.created');
    });
  });

  describe('EventHandlerMetadata', () => {
    test('should allow creating valid EventHandlerMetadata', () => {
      const metadata: EventHandlerMetadata = {
        pattern: 'download.*',
        methodName: 'handleDownload',
        skip: false,
      };

      expect(metadata.pattern).toBe('download.*');
      expect(metadata.methodName).toBe('handleDownload');
      expect(metadata.skip).toBe(false);
    });
  });

  describe('EventHandler', () => {
    test('should allow sync handler functions', () => {
      const handler: EventHandler = (eventName: string, _data?: any) => {
        expect(typeof eventName).toBe('string');
      };

      handler('test.event', { foo: 'bar' });
    });

    test('should allow async handler functions', async () => {
      const handler: EventHandler = async (eventName: string, _data?: any) => {
        await Promise.resolve();
        expect(typeof eventName).toBe('string');
      };

      await handler('test.event', { foo: 'bar' });
    });
  });

  describe('EventSubscription', () => {
    test('should allow creating valid EventSubscription', () => {
      const handler: EventHandler = (_eventName: string) => {};

      const subscription: EventSubscription = {
        pattern: 'download.*',
        handler: handler,
        once: false,
      };

      expect(subscription.pattern).toBe('download.*');
      expect(subscription.handler).toBe(handler);
      expect(subscription.once).toBe(false);
    });

    test('should allow optional once parameter', () => {
      const handler: EventHandler = (_eventName: string) => {};

      const subscription: EventSubscription = {
        pattern: 'user.created',
        handler: handler,
      };

      expect(subscription.once).toBeUndefined();
    });
  });
});
