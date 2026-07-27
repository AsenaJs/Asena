import { describe, expect, test } from 'bun:test';
import { Route } from '../../../../lib/server/web/decorators';
import { HttpMethod } from '../../../../lib/server/web/types';
import { ComponentConstants } from '../../../../lib/ioc';
import { getOwnTypedMetadata } from '../../../../lib/utils/typedMetadata';
import type { Route as RouteType } from '../../../../lib/adapter';

// `Route.method` is typed `HttpMethod`, but the whole point of @Route is methods the enum
// does not carry - PURGE, LINK. The runtime value is the lowercased string, so the method
// assertions read it as a string. See the note in the report about tightening Route.method.

describe('@Route decorator', () => {
  test('should register custom HTTP method as lowercase', () => {
    class TestController {
      @Route('PURGE', '/cache')
      public purgeCache() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect(routes).toBeDefined();
    expect(routes!['purgeCache']).toBeDefined();
    expect<string>(routes!['purgeCache'].method).toBe('purge');
    expect(routes!['purgeCache'].path).toBe('cache');
  });

  test('should accept object params with description', () => {
    class TestController {
      @Route('LINK', { path: '/resource', description: 'Link resource' })
      public linkResource() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect<string>(routes!['linkResource'].method).toBe('link');
    expect(routes!['linkResource'].path).toBe('resource');
    expect(routes!['linkResource'].description).toBe('Link resource');
  });

  test('should accept object params with summary and description', () => {
    class TestController {
      @Route('LINK', { path: '/resource', summary: 'Link it', description: 'Link resource to target' })
      public linkResource() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect(routes!['linkResource'].summary).toBe('Link it');
    expect(routes!['linkResource'].description).toBe('Link resource to target');
  });

  test('should accept object params with middlewares', () => {
    class TestMiddleware {}

    class TestController {
      @Route('PURGE', { path: '/cache', middlewares: [TestMiddleware as any] })
      public purgeCache() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect(routes!['purgeCache'].middlewares).toHaveLength(1);
  });

  test('should normalize leading slash in path', () => {
    class TestController {
      @Route('UNLINK', '/resources')
      public unlinkResource() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect(routes!['unlinkResource'].path).toBe('resources');
  });

  test('should work with standard HTTP methods', () => {
    class TestController {
      @Route('GET', '/test')
      public getTest() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect(routes!['getTest'].method).toBe(HttpMethod.GET);
    expect(routes!['getTest'].path).toBe('test');
  });

  test('should default to root path when no path provided', () => {
    class TestController {
      @Route('PURGE')
      public purgeAll() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect<string>(routes!['purgeAll'].method).toBe('purge');
    expect(routes!['purgeAll'].path).toBe('');
  });

  test('should coexist with other decorators on the same controller', () => {
    class TestController {
      @Route('PURGE', '/cache')
      public purgeCache() {}

      @Route('LINK', '/resource')
      public linkResource() {}
    }

    const routes = getOwnTypedMetadata<RouteType>(ComponentConstants.RouteKey, TestController);

    expect(routes!['purgeCache']).toBeDefined();
    expect(routes!['linkResource']).toBeDefined();
    expect<string>(routes!['purgeCache'].method).toBe('purge');
    expect<string>(routes!['linkResource'].method).toBe('link');
  });
});
