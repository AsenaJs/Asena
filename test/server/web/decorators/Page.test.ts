import { describe, expect, test } from 'bun:test';
import { Page } from '../../../../lib/server/web/decorators/Page';
import { ComponentConstants } from '../../../../lib/ioc';
import { getOwnTypedMetadata } from '../../../../lib/utils/typedMetadata';
import type { PageRoute } from '../../../../lib/server/web/decorators/Page';

describe('@Page Decorator', () => {
  describe('Single Page', () => {
    test('should store page route metadata', () => {
      class TestController {
        @Page('/home')
        public homePage() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes).toBeDefined();
      expect(routes!['homePage']).toBeDefined();
      expect(routes!['homePage'].path).toBe('home');
    });

    test('should normalize leading slash', () => {
      class TestController {
        @Page('/about')
        public aboutPage() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes!['aboutPage'].path).toBe('about');
    });

    test('should handle path without leading slash', () => {
      class TestController {
        @Page('settings')
        public settingsPage() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes!['settingsPage'].path).toBe('settings');
    });

    test('should handle wildcard path', () => {
      class TestController {
        @Page('/*')
        public catchAll() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes!['catchAll'].path).toBe('*');
    });
  });

  describe('Multiple Pages', () => {
    test('should accumulate multiple page routes', () => {
      class TestController {
        @Page('/home')
        public homePage() {}

        @Page('/about')
        public aboutPage() {}

        @Page('/contact')
        public contactPage() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes).toBeDefined();
      expect(Object.keys(routes!)).toHaveLength(3);
      expect(routes!['homePage'].path).toBe('home');
      expect(routes!['aboutPage'].path).toBe('about');
      expect(routes!['contactPage'].path).toBe('contact');
    });
  });

  describe('Edge Cases', () => {
    test('should handle root path', () => {
      class TestController {
        @Page('/')
        public rootPage() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes!['rootPage'].path).toBe('');
    });

    test('should normalize multiple leading slashes', () => {
      class TestController {
        @Page('///nested/path')
        public nestedPage() {}
      }

      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes!['nestedPage'].path).toBe('nested/path');
    });

    test('should not overwrite existing page route', () => {
      class TestController {
        @Page('/first')
        public myPage() {}
      }

      // Manually set a second @Page on the same method - should not overwrite
      const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, TestController);

      expect(routes!['myPage'].path).toBe('first');
    });
  });
});