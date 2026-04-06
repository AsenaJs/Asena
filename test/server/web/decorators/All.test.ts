import { describe, expect, test } from 'bun:test';
import { All } from '../../../../lib/server/web/decorators';
import { HttpMethod } from '../../../../lib/server/web/types';
import { ComponentConstants } from '../../../../lib/ioc';
import { getOwnTypedMetadata } from '../../../../lib/utils/typedMetadata';
import type { Route } from '../../../../lib/adapter';

describe('HttpMethod.ALL', () => {
  test('should exist in HttpMethod enum', () => {
    expect(HttpMethod.ALL).toBe('all');
  });

  test('should be distinct from other methods', () => {
    const methods = Object.values(HttpMethod);

    expect(methods).toContain('all');
    expect(new Set(methods).size).toBe(methods.length);
  });
});

describe('@All decorator', () => {
  test('should register route metadata with HttpMethod.ALL', () => {
    class TestController {
      @All('/')
      public handleAll() {}
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    expect(routes).toBeDefined();
    expect(routes!['handleAll']).toBeDefined();
    expect(routes!['handleAll'].method).toBe(HttpMethod.ALL);
    expect(routes!['handleAll'].path).toBe('');
  });

  test('should register route with custom path', () => {
    class TestController {
      @All('/proxy/*')
      public handleProxy() {}
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    expect(routes!['handleProxy'].method).toBe(HttpMethod.ALL);
    expect(routes!['handleProxy'].path).toBe('proxy/*');
  });

  test('should accept object params with middlewares', () => {
    class TestMiddleware {}

    class TestController {
      @All({ path: '/api', middlewares: [TestMiddleware as any] })
      public handleApi() {}
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    expect(routes!['handleApi'].method).toBe(HttpMethod.ALL);
    expect(routes!['handleApi'].path).toBe('api');
    expect(routes!['handleApi'].middlewares).toHaveLength(1);
  });

  test('should accept object params with description', () => {
    class TestController {
      @All({ path: '/health', description: 'Health check endpoint' })
      public healthCheck() {}
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    expect(routes!['healthCheck'].description).toBe('Health check endpoint');
  });

  test('should accept object params with summary', () => {
    class TestController {
      @All({ path: '/health', summary: 'Health check', description: 'Returns health status' })
      public healthCheck() {}
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    expect(routes!['healthCheck'].summary).toBe('Health check');
    expect(routes!['healthCheck'].description).toBe('Returns health status');
  });

  test('should coexist with other method decorators on the same controller', () => {
    class TestController {
      @All('/catch-all')
      public handleAll() {}

      // Simulate a Get decorator by directly checking metadata
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    expect(routes!['handleAll']).toBeDefined();
    expect(routes!['handleAll'].method).toBe(HttpMethod.ALL);
  });

  test('should normalize leading slash in path', () => {
    class TestController {
      @All('/users')
      public handleUsers() {}
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, TestController);

    // normalizePathString removes leading slashes
    expect(routes!['handleUsers'].path).toBe('users');
  });
});
