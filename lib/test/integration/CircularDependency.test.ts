import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServer, AsenaServerFactory } from '../../server';
import { Controller, Get, Inject, Service } from '../../server/decorators';
import type { AsenaContext } from '../../adapter';
import { CircularDependencyError } from '../../ioc';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for Circular Dependency Detection
 * Tests runtime circular dependency detection in end-to-end scenarios
 */
describe('Circular Dependency E2E Integration', () => {
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
  });

  test('should detect direct circular dependency A -> B -> A', async () => {
    @Service()
    class ServiceA {

      @Inject('ServiceB')
      public serviceB: any;

      public getData() {
        return 'ServiceA data';
      }
    
}

    @Service()
    class ServiceB {

      @Inject('ServiceA')
      public serviceA: any;

      public getData() {
        return 'ServiceB data';
      }
    
}

    @Controller('/test')
    class TestController {

      @Inject('ServiceA')
      public serviceA: any;

      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send(this.serviceA.getData());
      }
    
}

    // Test with AsenaServerFactory to properly handle circular dependencies
    expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [ServiceA, ServiceB, TestController],
      }),
    ).rejects.toThrow(CircularDependencyError);
  });

  test('should detect multi-level circular dependency A -> B -> C -> A', async () => {
    @Service()
    class ServiceA {

      @Inject('ServiceB')
      public serviceB: any;

      public getData() {
        return 'ServiceA data';
      }
    
}

    @Service()
    class ServiceB {

      @Inject('ServiceC')
      public serviceC: any;

      public getData() {
        return 'ServiceB data';
      }
    
}

    @Service()
    class ServiceC {

      @Inject('ServiceA')
      public serviceA: any;

      public getData() {
        return 'ServiceC data';
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send({ test: 'ok' });
      }
    
}

    // Test with AsenaServerFactory
    expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [ServiceA, ServiceB, ServiceC, TestController],
      }),
    ).rejects.toThrow(CircularDependencyError);
  });

  test('should detect circular dependency in factory pattern', async () => {
    @Service()
    class UserService {

      @Inject('PostService')
      public postService: any;

      public getUsers() {
        return [{ id: 1, name: 'User' }];
      }
    
}

    @Service()
    class PostService {

      @Inject('UserService')
      public userService: any;

      public getPosts() {
        return [{ id: 1, title: 'Post' }];
      }
    
}

    @Controller('/api')
    class ApiController {

      @Inject('UserService')
      public userService: any;

      @Get({ path: '/users' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send(this.userService.getUsers());
      }
    
}

    // Factory should detect circular dependency during component registration
    expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [UserService, PostService, ApiController],
      }),
    ).rejects.toThrow(CircularDependencyError);
  });

  test('should detect circular dependency with middleware', async () => {
    @Service()
    class AuthService {

      @Inject('LoggingService')
      public loggingService: any;

      public authenticate() {
        return 'authenticated';
      }
    
}

    @Service()
    class LoggingService {

      @Inject('AuthService')
      public authService: any;

      public log(message: string) {
        return `logged: ${message}`;
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send('ok');
      }
    
}

    // Test with AsenaServerFactory
    expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [AuthService, LoggingService, TestController],
      }),
    ).rejects.toThrow(CircularDependencyError);
  });

  test('should detect circular dependency in complex service chain', async () => {
    @Service()
    class DatabaseService {

      @Inject('CacheService')
      public cacheService: any;

      public connect() {
        return 'connected';
      }
    
}

    @Service()
    class CacheService {

      @Inject('ConfigService')
      public configService: any;

      public get(key: string) {
        return `cached: ${key}`;
      }
    
}

    @Service()
    class ConfigService {

      @Inject('DatabaseService')
      public databaseService: any;

      public getConfig() {
        return { setting: 'value' };
      }
    
}

    @Controller('/test')
    class TestController {

      @Get({ path: '/' })
      public test(context: AsenaContext<any, any>) {
        return context.send({ test: 'ok' });
      }
    
}

    // Test with AsenaServerFactory - should detect circular dependency during registration
    expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [DatabaseService, CacheService, ConfigService, TestController],
      }),
    ).rejects.toThrow(CircularDependencyError);
  });

  test('should handle non-circular dependencies correctly', async () => {
    @Service()
    class DatabaseService {

      public connect() {
        return 'connected';
      }
    
}

    @Service()
    class UserService {

      @Inject('DatabaseService')
      public databaseService: DatabaseService;

      public getUsers() {
        return [{ id: 1, name: 'User' }];
      }
    
}

    @Service()
    class PostService {

      @Inject('DatabaseService')
      public databaseService: DatabaseService;

      @Inject('UserService')
      public userService: UserService;

      public getPosts() {
        return [{ id: 1, title: 'Post' }];
      }
    
}

    @Controller('/api')
    class ApiController {

      @Inject('UserService')
      public userService: UserService;

      @Inject('PostService')
      public postService: PostService;

      @Get({ path: '/users' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send(this.userService.getUsers());
      }

      @Get({ path: '/posts' })
      public getPosts(context: AsenaContext<any, any>) {
        return context.send(this.postService.getPosts());
      }
    
}

    // This should work without circular dependency
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [DatabaseService, UserService, PostService, ApiController],
    });

    expect(server).toBeInstanceOf(AsenaServer);
  });
});
