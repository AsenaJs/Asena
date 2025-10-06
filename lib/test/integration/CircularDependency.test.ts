import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AsenaServerFactory } from '../../server/AsenaServerFactory';
import { AsenaServer } from '../../server/AsenaServer';
import { Service, Controller, Get, Inject } from '../../server/decorators';
import type { AsenaContext } from '../../adapter';
import { Container } from '../../ioc';
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
      serviceB: any;

      getData() {
        return 'ServiceA data';
      }
    }

    @Service()
    class ServiceB {
      @Inject('ServiceA')
      serviceA: any;

      getData() {
        return 'ServiceB data';
      }
    }

    @Controller('/test')
    class TestController {
      @Inject('ServiceA')
      serviceA: any;

      @Get({ path: '/' })
      test(context: AsenaContext) {
        return context.json(this.serviceA.getData());
      }
    }

    // Test with Container directly
    const container = new Container();
    await container.register('ServiceA', ServiceA, true);
    await container.register('ServiceB', ServiceB, true);

    await expect(container.resolve('ServiceA')).rejects.toThrow(CircularDependencyError);
  });

  test('should detect multi-level circular dependency A -> B -> C -> A', async () => {
    @Service()
    class ServiceA {
      @Inject('ServiceB')
      serviceB: any;

      getData() {
        return 'ServiceA data';
      }
    }

    @Service()
    class ServiceB {
      @Inject('ServiceC')
      serviceC: any;

      getData() {
        return 'ServiceB data';
      }
    }

    @Service()
    class ServiceC {
      @Inject('ServiceA')
      serviceA: any;

      getData() {
        return 'ServiceC data';
      }
    }

    const container = new Container();
    await container.register('ServiceA', ServiceA, true);
    await container.register('ServiceB', ServiceB, true);
    await container.register('ServiceC', ServiceC, true);

    await expect(container.resolve('ServiceA')).rejects.toThrow(CircularDependencyError);
  });

  test('should detect circular dependency in factory pattern', async () => {
    @Service()
    class UserService {
      @Inject('PostService')
      postService: any;

      getUsers() {
        return [{ id: 1, name: 'User' }];
      }
    }

    @Service()
    class PostService {
      @Inject('UserService')
      userService: any;

      getPosts() {
        return [{ id: 1, title: 'Post' }];
      }
    }

    @Controller('/api')
    class ApiController {
      @Inject('UserService')
      userService: any;

      @Get({ path: '/users' })
      getUsers(context: AsenaContext) {
        return context.json(this.userService.getUsers());
      }
    }

    // Factory should detect circular dependency during component registration
    await expect(
      AsenaServerFactory.create({
        adapter: mockAdapter,
        logger: mockLogger,
        port: 3000,
        components: [UserService, PostService, ApiController]
      })
    ).rejects.toThrow(CircularDependencyError);
  });

  test('should detect circular dependency with middleware', async () => {
    @Service()
    class AuthService {
      @Inject('LoggingService')
      loggingService: any;

      authenticate() {
        return 'authenticated';
      }
    }

    @Service()
    class LoggingService {
      @Inject('AuthService')
      authService: any;

      log(message: string) {
        return `logged: ${message}`;
      }
    }

    class AuthMiddleware {
      constructor(private authService: any) {}

      async handle(context: AsenaContext, next: () => Promise<void>) {
        this.authService.authenticate();
        await next();
      }
    }

    @Controller('/test')
    class TestController {
      @Get({ path: '/' })
      test(context: AsenaContext) {
        return context.send('ok');
      }
    }

    const container = new Container();
    await container.register('AuthService', AuthService, true);
    await container.register('LoggingService', LoggingService, true);

    await expect(container.resolve('AuthService')).rejects.toThrow(CircularDependencyError);
  });

  test('should detect circular dependency in complex service chain', async () => {
    @Service()
    class DatabaseService {
      @Inject('CacheService')
      cacheService: any;

      connect() {
        return 'connected';
      }
    }

    @Service()
    class CacheService {
      @Inject('ConfigService')
      configService: any;

      get(key: string) {
        return `cached: ${key}`;
      }
    }

    @Service()
    class ConfigService {
      @Inject('DatabaseService')
      databaseService: any;

      getConfig() {
        return { setting: 'value' };
      }
    }

    const container = new Container();
    await container.register('DatabaseService', DatabaseService, true);
    await container.register('CacheService', CacheService, true);
    await container.register('ConfigService', ConfigService, true);

    await expect(container.resolve('DatabaseService')).rejects.toThrow(CircularDependencyError);
    await expect(container.resolve('DatabaseService')).rejects.toThrow(/Circular dependency detected: DatabaseService -> CacheService -> ConfigService -> DatabaseService/);
  });

  test('should handle non-circular dependencies correctly', async () => {
    @Service()
    class DatabaseService {
      connect() {
        return 'connected';
      }
    }

    @Service()
    class UserService {
      @Inject('DatabaseService')
      databaseService: DatabaseService;

      getUsers() {
        return [{ id: 1, name: 'User' }];
      }
    }

    @Service()
    class PostService {
      @Inject('DatabaseService')
      databaseService: DatabaseService;

      @Inject('UserService')
      userService: UserService;

      getPosts() {
        return [{ id: 1, title: 'Post' }];
      }
    }

    @Controller('/api')
    class ApiController {
      @Inject('UserService')
      userService: UserService;

      @Inject('PostService')
      postService: PostService;

      @Get({ path: '/users' })
      getUsers(context: AsenaContext) {
        return context.json(this.userService.getUsers());
      }

      @Get({ path: '/posts' })
      getPosts(context: AsenaContext) {
        return context.json(this.postService.getPosts());
      }
    }

    // This should work without circular dependency
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [DatabaseService, UserService, PostService, ApiController]
    });

    expect(server).toBeInstanceOf(AsenaServer);
  });

  test('should detect circular dependency with WebSocket services', async () => {
    @Service()
    class ChatService {
      @Inject('NotificationService')
      notificationService: any;

      sendMessage(message: string) {
        return `chat: ${message}`;
      }
    }

    @Service()
    class NotificationService {
      @Inject('ChatService')
      chatService: any;

      sendNotification(message: string) {
        return `notification: ${message}`;
      }
    }

    class ChatWebSocket {
      constructor(private chatService: any) {}

      onMessage(ws: any, message: any) {
        return this.chatService.sendMessage(message);
      }
    }

    const container = new Container();
    await container.register('ChatService', ChatService, true);
    await container.register('NotificationService', NotificationService, true);

    await expect(container.resolve('ChatService')).rejects.toThrow(CircularDependencyError);
  });

  test('should provide detailed error message with dependency chain', async () => {
    @Service()
    class ServiceA {
      @Inject('ServiceB')
      serviceB: any;
    }

    @Service()
    class ServiceB {
      @Inject('ServiceC')
      serviceC: any;
    }

    @Service()
    class ServiceC {
      @Inject('ServiceA')
      serviceA: any;
    }

    const container = new Container();
    await container.register('ServiceA', ServiceA, true);
    await container.register('ServiceB', ServiceB, true);
    await container.register('ServiceC', ServiceC, true);

    try {
      await container.resolve('ServiceA');
    } catch (error) {
      expect(error).toBeInstanceOf(CircularDependencyError);
      expect(error.message).toContain('Circular dependency detected: ServiceA -> ServiceB -> ServiceC -> ServiceA');
      expect(error.name).toBe('CircularDependencyError');
    }
  });

  test('should handle circular dependency detection in singleton services', async () => {
    @Service()
    class SingletonServiceA {
      @Inject('SingletonServiceB')
      serviceB: any;
    }

    @Service()
    class SingletonServiceB {
      @Inject('SingletonServiceA')
      serviceA: any;
    }

    const container = new Container();
    await container.register('SingletonServiceA', SingletonServiceA, true);
    await container.register('SingletonServiceB', SingletonServiceB, true);

    // Both should fail with circular dependency
    await expect(container.resolve('SingletonServiceA')).rejects.toThrow(CircularDependencyError);
    await expect(container.resolve('SingletonServiceB')).rejects.toThrow(CircularDependencyError);
  });

  test('should handle circular dependency detection in transient services', async () => {
    class TransientServiceA {
      constructor(private serviceB: TransientServiceB) {}
    }

    class TransientServiceB {
      constructor(private serviceA: TransientServiceA) {}
    }

    const container = new Container();
    await container.register('TransientServiceA', TransientServiceA, false);
    await container.register('TransientServiceB', TransientServiceB, false);

    // Should still detect circular dependency even with transient services
    await expect(container.resolve('TransientServiceA')).rejects.toThrow(CircularDependencyError);
  });
});
