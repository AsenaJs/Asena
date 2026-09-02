import { describe, expect, test, mock, afterEach } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Controller, Service } from '../../lib/server/decorators';
import { Get, Post, All } from '../../lib/server/web/decorators';
import type { AsenaContext } from '../../lib/adapter';
import { Inject } from '../../lib/ioc/component';

// Shared mock service
@Service()
class SharedService {
  public value = 'test';
}

const createMockAdapter = () => ({
  name: 'MockAdapter',
  options: {},
  setPort: mock(() => {}),
  start: mock(async () => {}),
  registerRoute: mock(() => {}),
  registerWebsocketRoute: mock(() => {}),
  prepareMiddlewares: mock(() => []),
  prepareHandler: mock(() => () => {}),
  prepareValidator: mock(() => {}),
  use: mock(() => {}),
  serveOptions: mock(async (options: () => Promise<any>) => {}),
  websocketAdapter: {
    registerWebSocket: mock(() => {}),
    startWebsocket: mock(() => {}),
  },
});

const createMockLogger = () => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
});

describe('Duplicate Route Detection', () => {
  afterEach(() => {
    mock().mockClear();
  });

  test('should throw error when two controllers register the same GET path', async () => {
    @Controller('/api')
    class ControllerA {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/users')
      public listUsers(context: AsenaContext<any, any>) {
        return context.send('A');
      }
    }

    @Controller('/api')
    class ControllerB {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/users')
      public getUsers(context: AsenaContext<any, any>) {
        return context.send('B');
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter() as any,
      logger: createMockLogger() as any,
      port: 3000,
      components: [SharedService, ControllerA, ControllerB],
    });

    expect(server.start()).rejects.toThrow('Duplicate route detected');
  });

  test('should not throw error when controllers register different methods on same path', async () => {
    @Controller('/api')
    class ControllerC {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/items')
      public getItems(context: AsenaContext<any, any>) {
        return context.send('get');
      }
    }

    @Controller('/api')
    class ControllerD {
      @Inject(SharedService)
      private service: SharedService;

      @Post('/items')
      public createItem(context: AsenaContext<any, any>) {
        return context.send('post');
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter() as any,
      logger: createMockLogger() as any,
      port: 3000,
      components: [SharedService, ControllerC, ControllerD],
    });

    // Should not throw - different HTTP methods on same path is valid
    expect(server.start()).resolves.toBeUndefined();
  });

  test('should throw error when @All conflicts with specific method on same path', async () => {
    @Controller('/proxy')
    class ProxyController {
      @Inject(SharedService)
      private service: SharedService;

      @All('/endpoint')
      public handleAll(context: AsenaContext<any, any>) {
        return context.send('all');
      }
    }

    @Controller('/proxy')
    class ConflictController {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/endpoint')
      public handleGet(context: AsenaContext<any, any>) {
        return context.send('get');
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter() as any,
      logger: createMockLogger() as any,
      port: 3000,
      components: [SharedService, ProxyController, ConflictController],
    });

    expect(server.start()).rejects.toThrow('Duplicate route detected');
  });

  test('should throw error when specific method conflicts with existing @All on same path', async () => {
    @Controller('/catch')
    class FirstController {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/data')
      public getData(context: AsenaContext<any, any>) {
        return context.send('get');
      }
    }

    @Controller('/catch')
    class SecondController {
      @Inject(SharedService)
      private service: SharedService;

      @All('/data')
      public handleAll(context: AsenaContext<any, any>) {
        return context.send('all');
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter() as any,
      logger: createMockLogger() as any,
      port: 3000,
      components: [SharedService, FirstController, SecondController],
    });

    expect(server.start()).rejects.toThrow('Duplicate route detected');
  });

  test('should include controller and handler names in error message', async () => {
    @Controller({ path: '/dup', name: 'AlphaController' })
    class AlphaController {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/test')
      public testMethod(context: AsenaContext<any, any>) {
        return context.send('alpha');
      }
    }

    @Controller({ path: '/dup', name: 'BetaController' })
    class BetaController {
      @Inject(SharedService)
      private service: SharedService;

      @Get('/test')
      public testMethod(context: AsenaContext<any, any>) {
        return context.send('beta');
      }
    }

    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter() as any,
      logger: createMockLogger() as any,
      port: 3000,
      components: [SharedService, AlphaController, BetaController],
    });

    try {
      await server.start();
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toContain('AlphaController');
      expect(error.message).toContain('BetaController');
      expect(error.message).toContain('testMethod');
    }
  });

  // Both adapters treat `/api/users` and `/api/users/` as one route - hono normalizes the path,
  // ergenecore registers both spellings - so a pair that differs only in a trailing slash used to
  // boot with one handler silently shadowing the other.
  describe('paths that differ only in spelling', () => {
    const boot = async (components: any[]) => {
      const server = await AsenaServerFactory.create({
        adapter: createMockAdapter() as any,
        logger: createMockLogger() as any,
        port: 3000,
        components,
      });

      return server.start();
    };

    test('a controller prefix that swallows the route path conflicts with the split spelling', async () => {
      @Controller('/api')
      class ControllerA {
        @Get('/users')
        public listUsers(context: AsenaContext<any, any>) {
          return context.send('A');
        }
      }

      @Controller('/api/users')
      class ControllerB {
        @Get('/')
        public index(context: AsenaContext<any, any>) {
          return context.send('B');
        }
      }

      const failure = await boot([SharedService, ControllerA, ControllerB]).then(
        () => undefined,
        (error: Error) => error,
      );

      // Names both sides, in whichever order the container resolved them: the two controllers are
      // in different files and neither spelling looks like the other at the call site.
      expect(failure?.message).toMatch(/Duplicate route detected: GET \/api\/users/);
      expect(failure?.message).toContain('ControllerA.listUsers()');
      expect(failure?.message).toContain('ControllerB.index()');
    });

    test('a trailing slash on either the prefix or the route path conflicts', async () => {
      @Controller('/api/')
      class SlashPrefixController {
        @Get('/users')
        public listUsers(context: AsenaContext<any, any>) {
          return context.send('prefix');
        }
      }

      @Controller('/api')
      class SlashRouteController {
        @Get('/users/')
        public alsoListUsers(context: AsenaContext<any, any>) {
          return context.send('route');
        }
      }

      await expect(boot([SharedService, SlashPrefixController, SlashRouteController])).rejects.toThrow(
        /Duplicate route detected/,
      );
    });

    test('an @All on the swallowed spelling conflicts with a @Get on the split one', async () => {
      @Controller('/api')
      class GetSplitController {
        @Get('/users')
        public listUsers(context: AsenaContext<any, any>) {
          return context.send('get');
        }
      }

      @Controller('/api/users')
      class AllSwallowedController {
        @All('/')
        public everything(context: AsenaContext<any, any>) {
          return context.send('all');
        }
      }

      const failure = await boot([SharedService, GetSplitController, AllSwallowedController]).then(
        () => undefined,
        (error: Error) => error,
      );

      expect(failure?.message).toMatch(/Duplicate route detected/);
      expect(failure?.message).toContain('listUsers');
      expect(failure?.message).toContain('everything');
    });

    test('two distinct routes under the same prefix still boot', async () => {
      @Controller('/api/users')
      class UsersIndexController {
        @Get('/')
        public index(context: AsenaContext<any, any>) {
          return context.send('index');
        }

        @Get('/x')
        public detail(context: AsenaContext<any, any>) {
          return context.send('x');
        }
      }

      await expect(boot([SharedService, UsersIndexController])).resolves.toBeUndefined();
    });
  });
});
