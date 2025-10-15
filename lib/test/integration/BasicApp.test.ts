import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../server';
import { AsenaServer } from '../../server';
import { Controller, Get, Inject, Service } from '../../server/decorators';
import type { AsenaContext } from '../../adapter';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * @description Integration test for basic application functionality
 * Tests Controller + Service with HTTP request handling
 */
describe('Basic Application Integration', () => {
  let server: AsenaServer<any>;
  let mockAdapter: any;
  let mockLogger: any;

  beforeEach(async () => {
    // Create mock adapter and logger
    const mockSetup = createMockAdapter();

    mockAdapter = mockSetup.adapter;
    mockLogger = mockSetup.logger;
  });

  afterEach(async () => {
    // Clean up server if it exists
    if (server) {
      try {
        // await server.stop?.();
        // TODO: add stop
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  // TODO: we need to improve mock adapter maybe we need to use bun default
  test('should handle dependency injection correctly', async () => {
    @Service()
    class DatabaseService {

      public connect() {
        return 'Connected to database';
      }
    
}

    @Service()
    class UserService {

      @Inject(DatabaseService)
      public database: DatabaseService;

      public getUsers() {
        const connection = this.database.connect();

        return [{ id: 1, name: 'User', connection }];
      }
    
}

    @Controller('/api')
    class ApiController {

      @Inject(UserService)
      public userService: UserService;

      @Get({ path: '/users' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send(this.userService.getUsers());
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [DatabaseService, UserService, ApiController],
    });

    await server.start();

    const response = await mockAdapter.testRequest('GET', '/api/users');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toHaveProperty('connection', 'Connected to database');
  });

  // TODO: we need to improve mock adapter maybe we need to use bun default
  test('should handle multiple controllers', async () => {
    @Service()
    class SharedService {

      public getData() {
        return 'shared data';
      }
    
}

    @Controller('/users')
    class UserController {

      @Inject(SharedService)
      public sharedService: SharedService;

      @Get({ path: '/' })
      public getUsers(context: AsenaContext<any, any>) {
        return context.send({ users: 'users', data: this.sharedService.getData() });
      }
    
}

    @Controller('/posts')
    class PostController {

      @Inject(SharedService)
      public sharedService: SharedService;

      @Get({ path: '/' })
      public getPosts(context: AsenaContext<any, any>) {
        return context.send({ posts: 'posts', data: this.sharedService.getData() });
      }
    
}

    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [SharedService, UserController, PostController],
    });

    await server.start();

    // Test both controllers
    const usersResponse = await mockAdapter.testRequest('GET', '/users');

    console.log(usersResponse);

    expect(usersResponse.status).toBe(200);
    expect(usersResponse.body).toHaveProperty('users', 'users');
    expect(usersResponse.body).toHaveProperty('data', 'shared data');

    const postsResponse = await mockAdapter.testRequest('GET', '/posts');

    expect(postsResponse.status).toBe(200);
    expect(postsResponse.body).toHaveProperty('posts', 'posts');
    expect(postsResponse.body).toHaveProperty('data', 'shared data');
  });

  test('should handle empty components array', async () => {
    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components: [],
    });

    await server.start();

    expect(server).toBeInstanceOf(AsenaServer);
    // @ts-ignore
    expect(server.coreContainer.currentPhase).toBe('SERVER_READY');
  });

  test('should handle server without components', async () => {
    server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
    });

    await server.start();

    expect(server).toBeInstanceOf(AsenaServer);
    // @ts-ignore
    expect(server.coreContainer.currentPhase).toBe('SERVER_READY');
  });
});
