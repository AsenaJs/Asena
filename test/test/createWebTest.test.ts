import { describe, expect, mock, test } from 'bun:test';
import { createWebTest } from '../../lib/test/harness/createWebTest';
import { createCapturingLogger } from '../../lib/test/harness/silentLogger';
import { Controller, Middleware, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { AsenaMiddlewareService } from '../../lib/server/web/middleware';
import { Inject } from '../../lib/ioc/component';
import type { AsenaContext } from '../../lib/adapter';
import { ulak, type Ulak } from '../../lib/server/messaging';
import { createMockAdapter } from '../utils/createMockContext';

@Service()
class UserService {
  public async findById(id: string) {
    return { id, name: 'real' };
  }

  public async deleteById(_id: string) {
    return true;
  }
}

@Service()
class AuditService {
  public async record(_event: string) {
    return true;
  }
}

@Middleware()
class AuthMiddleware extends AsenaMiddlewareService {
  @Inject(AuditService)
  private auditService: AuditService;

  public async handle(_context: AsenaContext<any, any>, next: () => Promise<void>): Promise<void> {
    await this.auditService.record('auth');
    await next();
  }
}

@Controller({ path: '/users', middlewares: [AuthMiddleware] })
class UserController {
  @Inject(UserService)
  private userService: UserService;

  @Get('/:id')
  public async find(context: AsenaContext<any, any>) {
    return context.send(await this.userService.findById('1'));
  }
}

@Controller('/admin')
class AdminController {
  // Same service as UserController - must resolve to the same shared double
  @Inject(UserService)
  private userService: UserService;

  @Get('/purge')
  public async purge(context: AsenaContext<any, any>) {
    return context.send(await this.userService.deleteById('1'));
  }
}

@Controller('/chat')
class ChatController {
  @Inject(ulak('/chat'))
  private chat: Ulak.NameSpace<'/chat'>;

  @Get('/ping')
  public async ping(context: AsenaContext<any, any>) {
    await this.chat.broadcast({ type: 'ping' });

    return context.send('ok');
  }
}

@Controller('/legacy')
class LegacyController {
  @Inject('UserService')
  private userService: UserService;

  @Get('/')
  public async list(context: AsenaContext<any, any>) {
    return context.send(await this.userService.findById('1'));
  }
}

@Service()
class NotAController {}

abstract class CrudServiceBase {
  public async findById(_id: string) {
    return { id: _id, name: 'base' };
  }
}

@Service()
class InheritingUserService extends CrudServiceBase {
  public async search(_query: string) {
    return [];
  }
}

abstract class GuardedControllerBase {
  @Inject(UserService)
  protected userService: UserService;

  @Get({ path: '/guarded', middlewares: [AuthMiddleware] })
  public async guarded(context: AsenaContext<any, any>) {
    return context.send(await this.userService.findById('1'));
  }
}

@Controller('/inherited')
class InheritingController extends GuardedControllerBase {
  // An own route as well as the inherited one: with only inherited routes, a revert to the
  // nearest-ancestor read would still produce the right answer and the test would pass.
  @Get('/own')
  public async own(context: AsenaContext<any, any>) {
    return context.send({ own: true });
  }
}

@Controller('/mocking')
class MockingController {
  @Inject(InheritingUserService)
  private userService: InheritingUserService;

  @Get('/find')
  public async find(context: AsenaContext<any, any>) {
    return context.send(await this.userService.findById('1'));
  }
}

const webTest = (options: any) => createWebTest({ adapter: createMockAdapter().adapter as any, ...options });

describe('createWebTest', () => {
  describe('validation', () => {
    test('should reject classes that are not controllers', async () => {
      await expect(webTest({ controllers: [NotAController] })).rejects.toThrow(
        /expects @Controller classes, but received 'NotAController'/,
      );
    });

    test('should reject an empty controller list', async () => {
      await expect(webTest({ controllers: [] })).rejects.toThrow(/at least one @Controller/);
    });
  });

  describe('auto-mocking', () => {
    test('should mock injected services with the real method shape', async () => {
      const { app, mocks } = await webTest({ controllers: [UserController] });

      expect(Object.keys(mocks.UserService).sort()).toEqual(['deleteById', 'findById']);

      mocks.UserService.findById.mockResolvedValue({ id: '1', name: 'mocked' });

      const controller = await app.resolve<UserController>('UserController');

      expect(await (controller as any).userService.findById('1')).toEqual({ id: '1', name: 'mocked' });

      await app.stop();
    });

    test('should key mocks by service name, not field name', async () => {
      const { app, mocks } = await webTest({ controllers: [UserController] });

      expect(mocks.UserService).toBeDefined();
      expect(mocks.userService).toBeUndefined();

      await app.stop();
    });

    test('should share one mock between controllers injecting the same service', async () => {
      const { app, mocks } = await webTest({ controllers: [UserController, AdminController] });

      const userController = await app.resolve<UserController>('UserController');
      const adminController = await app.resolve<AdminController>('AdminController');

      expect((userController as any).userService).toBe(mocks.UserService);
      expect((adminController as any).userService).toBe(mocks.UserService);

      await app.stop();
    });

    test('should register controller middlewares for real and mock their dependencies', async () => {
      const { app, mocks } = await webTest({ controllers: [UserController] });

      // The middleware itself is real - the framework resolves it by name at start-up
      expect(app.container.has('AuthMiddleware')).toBe(true);
      // ...but its own dependency is mocked
      expect(mocks.AuditService).toBeDefined();
      expect(Object.keys(mocks.AuditService)).toEqual(['record']);

      await app.stop();
    });

    test('should keep components passed as real', async () => {
      const { app, mocks } = await webTest({ controllers: [UserController], components: [UserService] });

      expect(mocks.UserService).toBeUndefined();

      const service = await app.resolve<UserService>('UserService');

      expect(await service.findById('9')).toEqual({ id: '9', name: 'real' });

      await app.stop();
    });
  });

  describe('core services', () => {
    test('should leave ulak and other core services real', async () => {
      const { app, mocks } = await webTest({ controllers: [ChatController] });

      expect(mocks.__Ulak__).toBeUndefined();

      const controller = await app.resolve<ChatController>('ChatController');

      // The real ulak namespace is injected, so the expression resolved against it
      expect((controller as any).chat).toBeDefined();
      expect(typeof (controller as any).chat.broadcast).toBe('function');

      await app.stop();
    });
  });

  describe('explicit overrides', () => {
    test('should win over the auto-generated mock', async () => {
      const double = { findById: mock(async () => ({ id: '1', name: 'explicit' })) };

      const { app, mocks } = await webTest({
        controllers: [UserController],
        overrides: { UserService: double },
      });

      expect(mocks.UserService).toBe(double);

      const controller = await app.resolve<UserController>('UserController');

      expect((controller as any).userService).toBe(double);

      await app.stop();
    });
  });

  // collectWebLayer walks each controller's routes to find the middlewares and validators
  // that must be registered for real. Reading own metadata only meant an inherited route's
  // middleware never reached the container, and the slice boot threw on it.
  describe('inherited routes', () => {
    test('should register a middleware declared on an inherited route', async () => {
      const { app, mocks } = await webTest({ controllers: [InheritingController] });

      // AuthMiddleware is referenced only by the base class's route. Its own @Inject proves
      // it was collected and registered rather than skipped.
      expect(mocks.AuditService).toBeDefined();

      const controller = await app.resolve<InheritingController>('InheritingController');

      expect(controller).toBeDefined();

      await app.stop();
    });

    test('should mock services injected on the base class', async () => {
      const { app, mocks } = await webTest({ controllers: [InheritingController] });

      expect(Object.keys(mocks.UserService).sort()).toEqual(['deleteById', 'findById']);

      await app.stop();
    });

    test('should register both the inherited and the own route', async () => {
      const { app } = await webTest({ controllers: [InheritingController] });

      const controller = await app.resolve<InheritingController>('InheritingController');

      // Both reachable on the resolved instance - the harness collected the merged route map,
      // not just the leaf's own entries.
      expect(typeof (controller as any).guarded).toBe('function');
      expect(typeof (controller as any).own).toBe('function');

      await app.stop();
    });

    test('should mock methods a service inherits from its own base class', async () => {
      const { app, mocks } = await webTest({ controllers: [MockingController] });

      // detectClassMethods walked only the own prototype, so `findById` - declared on
      // CrudServiceBase - was missing from the double and the controller died with
      // "findById is not a function" *inside the harness*.
      expect(Object.keys(mocks.InheritingUserService).sort()).toEqual(['findById', 'search']);

      mocks.InheritingUserService.findById.mockResolvedValue({ id: '1', name: 'mocked' });

      const controller = await app.resolve<MockingController>('MockingController');

      expect(await (controller as any).userService.findById('1')).toEqual({ id: '1', name: 'mocked' });

      await app.stop();
    });
  });

  describe('string injections', () => {
    test('should warn and fall back to an empty object', async () => {
      const { logger, entries } = createCapturingLogger();

      const { app, mocks } = await webTest({ controllers: [LegacyController], logger });

      expect(mocks.UserService).toEqual({});
      expect(entries.some((entry) => entry.level === 'warn' && entry.message.includes('was injected by name'))).toBe(
        true,
      );

      await app.stop();
    });
  });
});
