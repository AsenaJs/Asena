import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { AsenaServer } from '../../server';
import { AsenaServerFactory } from '../../server';
import { Config, Controller, Get, Inject, Middleware, Service } from '../../server/decorators';
import type { AsenaContext } from '../../adapter';
import { AsenaMiddlewareService } from '../../server/web/middleware';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for middleware chain execution
 * Tests Global, Controller, and Route level middleware execution order
 */
describe('Middleware Chain Integration', () => {
  let server: AsenaServer<any>;
  let mockAdapter: any;
  let mockLogger: any;
  let executionOrder: string[];

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
    executionOrder = [];
  });

  afterEach(async () => {
    // Clean up server if it exists
    if (server) {
      try {
        // await server.stop?.();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('should execute middlewares in correct order: global → controller → route → handler', async () => {
    // Global middleware
    @Middleware()
    class GlobalMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('global');
        await next();
      }
    
}

    // Controller middleware
    @Middleware()
    class ControllerMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('controller');
        await next();
      }
    
}

    // Route middleware
    @Middleware()
    class RouteMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('route');
        await next();
      }
    
}

    // Config with global middlewares
    @Config()
    class AppConfig {

      public globalMiddlewares() {
        return [GlobalMiddleware];
      }
    
}

    // Controller with middleware
    @Controller({ path: '/test', middlewares: [ControllerMiddleware] })
    class TestController {

      @Get({ path: '/', middlewares: [RouteMiddleware] })
      public test(context: AsenaContext<any, any>) {
        executionOrder.push('handler');
        return context.send('ok');
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [AppConfig, GlobalMiddleware, ControllerMiddleware, RouteMiddleware, TestController],
    });

    await server.start();

    // Make request
    await mockAdapter.testRequest('GET', '/test');

    // Verify execution order
    expect(executionOrder).toEqual(['global', 'controller', 'route', 'handler']);
  });

  test('should handle multiple global middlewares', async () => {
    @Middleware()
    class GlobalMiddleware1 extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('global1');
        await next();
      }
    
}

    @Middleware()
    class GlobalMiddleware2 extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('global2');
        await next();
      }
    
}

    @Config()
    class AppConfig {

      public globalMiddlewares() {
        return [GlobalMiddleware1, GlobalMiddleware2];
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        executionOrder.push('handler');
        return context.send('ok');
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [AppConfig, GlobalMiddleware1, GlobalMiddleware2, TestController],
    });

    await server.start();

    await mockAdapter.testRequest('GET', '/test');

    expect(executionOrder).toEqual(['global1', 'global2', 'handler']);
  });

  test('should handle multiple route middlewares', async () => {
    @Middleware()
    class RouteMiddleware1 extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('route1');
        await next();
      }
    
}

    @Middleware()
    class RouteMiddleware2 extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('route2');
        await next();
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/', middlewares: [RouteMiddleware1, RouteMiddleware2] })
      public test(context: AsenaContext<any, any>) {
        executionOrder.push('handler');
        return context.send('ok');
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [RouteMiddleware1, RouteMiddleware2, TestController],
    });

    await server.start();

    await mockAdapter.testRequest('GET', '/test');

    expect(executionOrder).toEqual(['route1', 'route2', 'handler']);
  });

  test('should handle middleware with dependency injection', async () => {
    @Service()
    class LoggingService {

      public log(message: string): void {
        executionOrder.push(`log: ${message}`);
      }
    
}

    @Middleware()
    class LoggingMiddleware extends AsenaMiddlewareService {

      @Inject(LoggingService)
      public loggingService: LoggingService;

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        this.loggingService.log('middleware executed');
        await next();
      }
    
}

    @Config()
    class AppConfig {

      public globalMiddlewares() {
        return [LoggingMiddleware];
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        executionOrder.push('handler');
        return context.send('ok');
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [AppConfig, LoggingService, LoggingMiddleware, TestController],
    });

    await server.start();

    await mockAdapter.testRequest('GET', '/test');

    expect(executionOrder).toContain('log: middleware executed');
    expect(executionOrder).toContain('handler');
  });

  test('should handle middleware error handling', async () => {
    @Middleware()
    class ErrorMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('error-middleware');
        try {
          await next();
        } catch (error) {
          executionOrder.push('error-caught');
          throw error;
        }
      }
    
}

    @Config()
    class AppConfig {

      public globalMiddlewares() {
        return [ErrorMiddleware];
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public test(_context: AsenaContext<any, any>) {
        executionOrder.push('handler');
        throw new Error('Test error');
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [AppConfig, ErrorMiddleware, TestController],
    });

    await server.start();

    try {
      await mockAdapter.testRequest('GET', '/test');
    } catch (error) {
      // Expected to throw
    }

    expect(executionOrder).toEqual(['error-middleware', 'handler', 'error-caught']);
  });

  test('should handle middleware with async operations', async () => {
    @Middleware()
    class AsyncMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('async-start');

        // Simulate async operation
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        executionOrder.push('async-middle');
        await next();
        executionOrder.push('async-end');
      }
    
}

    @Config()
    class AppConfig {

      public globalMiddlewares() {
        return [AsyncMiddleware];
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public async test(context: AsenaContext<any, any>) {
        executionOrder.push('handler-start');

        // Simulate async operation in handler
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });

        executionOrder.push('handler-end');
        return context.send('ok');
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [AppConfig, AsyncMiddleware, TestController],
    });

    await server.start();

    await mockAdapter.testRequest('GET', '/test');

    expect(executionOrder).toEqual(['async-start', 'async-middle', 'handler-start', 'handler-end', 'async-end']);
  });

  test('should handle complex middleware chain', async () => {
    @Middleware()
    class AuthMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('auth');
        await next();
      }
    
}

    @Middleware()
    class RateLimitMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('rate-limit');
        await next();
      }
    
}

    @Middleware()
    class LoggingMiddleware extends AsenaMiddlewareService {

      public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
        executionOrder.push('logging');
        await next();
      }
    
}

    @Controller({ path: '/api', middlewares: [AuthMiddleware] })
    class ApiController {

      @Get({ path: '/users', middlewares: [RateLimitMiddleware] })
      public getUsers(context: AsenaContext<any, any>) {
        executionOrder.push('get-users');
        return context.send({ users: [] });
      }

      @Get({ path: '/posts', middlewares: [LoggingMiddleware] })
      public getPosts(context: AsenaContext<any, any>) {
        executionOrder.push('get-posts');
        return context.send({ posts: [] });
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [AuthMiddleware, RateLimitMiddleware, LoggingMiddleware, ApiController],
    });

    await server.start();

    // Test first route
    await mockAdapter.testRequest('GET', '/api/users');
    expect(executionOrder).toEqual(['auth', 'rate-limit', 'get-users']);

    // Reset for second test
    executionOrder = [];

    // Test second route
    await mockAdapter.testRequest('GET', '/api/posts');
    expect(executionOrder).toEqual(['auth', 'logging', 'get-posts']);
  });
});
