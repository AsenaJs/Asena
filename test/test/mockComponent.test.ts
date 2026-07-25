import { describe, expect, mock, test } from 'bun:test';
// Imported from lib/ (not the @asenajs/asena/test specifier, which resolves to dist/) so a
// stale build cannot mask a regression. All four must come from the same tree: metadata keys
// are Symbols created per module instance, so mixing lib/ and dist/ makes them invisible.
import { createTestUlakStub, mockComponent, mockComponentAsync } from '../../lib/test';
import { Component } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';
import { ulak, type Ulak } from '../../lib/server/messaging';

@Component()
class UserService {
  public async createUser(name: string, email: string) {
    return { id: '1', name, email };
  }

  public async findById(id: string) {
    return { id, name: 'John', email: 'john@example.com' };
  }

  public async deleteUser(_id: string) {
    return true;
  }
}

@Component()
class LoginService {
  public async login(_email: string, _password: string) {
    return { token: 'jwt-token', userId: '1' };
  }

  public async validateToken(_token: string) {
    return true;
  }
}

@Component()
class AuthService {
  @Inject(UserService)
  private userService: UserService;

  @Inject(LoginService)
  private loginService: LoginService;

  public async register(name: string, email: string, password: string) {
    const user = await this.userService.createUser(name, email);
    const loginResult = await this.loginService.login(email, password);
    return { user, token: loginResult.token };
  }

  public async authenticate(email: string, password: string) {
    return await this.loginService.login(email, password);
  }
}

@Component()
class PaymentService {
  @Inject(UserService)
  private userService: UserService;

  public async processPayment(userId: string, amount: number) {
    const user = await this.userService.findById(userId);
    return { success: true, user, amount };
  }
}

@Component()
// @ts-ignore
class ServiceWithExpression {
  @Inject('UserService', (s) => s.createUser)
  private createUserFn: (name: string, email: string) => Promise<any>;

  public async addUser(name: string, email: string) {
    return await this.createUserFn(name, email);
  }
}

@Component()
// @ts-ignore
class StringInjectedService {
  // A string carries no class reference, so this field cannot be auto-mocked from a shape
  @Inject('UserService')
  private userService: UserService;

  public async find(id: string) {
    return await this.userService.findById(id);
  }
}

@Component()
class StatsService {
  @Inject(ulak('/stats'))
  private statsChannel: Ulak.NameSpace<'/stats'>;

  @Inject(UserService)
  private userService: UserService;

  public async createAnonUser(name: string) {
    const user = await this.userService.createUser(name, `${name}@example.com`);

    await this.statsChannel.broadcast({ action: 'update', data: { newUser: 1 } });

    return user;
  }

  public async publishStats(payload: any) {
    await this.statsChannel.broadcast(payload);
  }
}

describe('mockComponent', () => {
  describe('basic functionality', () => {
    test('should create instance with mocked dependencies', () => {
      const { instance, mocks } = mockComponent(AuthService);

      expect(instance).toBeInstanceOf(AuthService);
      expect(mocks).toBeDefined();
      expect(mocks['userService']).toBeDefined();
      expect(mocks['loginService']).toBeDefined();
    });

    test('should inject mocks into instance', () => {
      const { instance, mocks } = mockComponent(AuthService);

      expect((instance as any).userService).toBe(mocks['userService']);
      expect((instance as any).loginService).toBe(mocks['loginService']);
    });

    test('should allow configuring mock behavior with overrides', async () => {
      const { instance } = mockComponent(AuthService, {
        overrides: {
          userService: {
            createUser: mock(async (name: string, email: string) => ({
              id: 'user-123',
              name,
              email,
            })),
          },
          loginService: {
            login: mock(async () => ({
              token: 'test-token',
              userId: 'user-123',
            })),
          },
        },
      });

      const result = await instance.register('John Doe', 'john@example.com', 'password');

      expect(result.user.id).toBe('user-123');
      expect(result.token).toBe('test-token');
    });

    test('should track mock calls with overrides', async () => {
      const { instance, mocks } = mockComponent(AuthService, {
        overrides: {
          loginService: {
            login: mock(async () => ({
              token: 'test-token',
              userId: 'user-123',
            })),
          },
        },
      });

      await instance.authenticate('john@example.com', 'password');

      expect(mocks['loginService'].login).toHaveBeenCalledTimes(1);
      expect(mocks['loginService'].login).toHaveBeenCalledWith('john@example.com', 'password');
    });
  });

  describe('auto-mock from class injections', () => {
    test('should generate callable method mocks without any overrides', async () => {
      const { instance, mocks } = mockComponent(AuthService);

      mocks['userService'].createUser.mockResolvedValue({ id: 'user-123', name: 'Ada', email: 'ada@example.com' });
      mocks['loginService'].login.mockResolvedValue({ token: 'auto-token', userId: 'user-123' });

      const result = await instance.register('Ada', 'ada@example.com', 'password');

      expect(result.user.id).toBe('user-123');
      expect(result.token).toBe('auto-token');
      expect(mocks['userService'].createUser).toHaveBeenCalledWith('Ada', 'ada@example.com');
    });

    test('should mock every method declared on the injected class', () => {
      const { mocks } = mockComponent(AuthService);

      expect(Object.keys(mocks['userService']).sort()).toEqual(['createUser', 'deleteUser', 'findById']);
      expect(Object.keys(mocks['loginService']).sort()).toEqual(['login', 'validateToken']);
    });

    test('should default async methods to resolving null', async () => {
      const { mocks } = mockComponent(AuthService);

      await expect(mocks['userService'].findById('1')).resolves.toBeNull();
    });

    test('should auto-mock class injections alongside expression injections', async () => {
      const { instance, mocks } = mockComponent(StatsService);

      mocks['userService'].createUser.mockResolvedValue({ id: 'anon-1', name: 'anon' });

      const user = await instance.createAnonUser('anon');

      expect(user.id).toBe('anon-1');
      // the ulak field still goes through the deep-mock branch and stays assertable
      expect(mocks['statsChannel'].broadcast).toHaveBeenCalledWith({ action: 'update', data: { newUser: 1 } });
    });

    test('should still fall back to an empty object for string injections', () => {
      const { mocks } = mockComponent(StringInjectedService);

      expect(mocks['userService']).toEqual({});
      expect(mocks['userService'].findById).toBeUndefined();
    });

    test('should let an override win over the auto-generated mock', () => {
      const customMock = { findById: mock(async () => ({ id: 'custom' })) };

      const { instance, mocks } = mockComponent(PaymentService, {
        overrides: { userService: customMock },
      });

      expect(mocks['userService']).toBe(customMock);
      expect((instance as any).userService).toBe(customMock);
    });
  });

  describe('options.injections', () => {
    test('should only mock specified fields', () => {
      const { mocks } = mockComponent(AuthService, {
        injections: ['userService'],
      });

      expect(mocks['userService']).toBeDefined();
      expect(mocks['loginService']).toBeUndefined();
    });

    test('should leave non-mocked fields as undefined', () => {
      const { instance } = mockComponent(AuthService, {
        injections: ['userService'],
      });

      expect((instance as any).userService).toBeDefined();
      expect((instance as any).loginService).toBeUndefined();
    });
  });

  describe('options.overrides', () => {
    test('should use custom mock when provided', () => {
      const customMock = {
        createUser: async () => ({ id: 'custom-id', name: 'Custom', email: 'custom@example.com' }),
      };

      const { instance, mocks } = mockComponent(PaymentService, {
        overrides: {
          userService: customMock,
        },
      });

      expect(mocks['userService']).toBe(customMock);
      expect((instance as any).userService).toBe(customMock);
    });

    test('should auto-mock non-overridden fields', () => {
      const customMock = {
        login: async () => ({ token: 'custom-token', userId: '1' }),
      };

      const { mocks } = mockComponent(AuthService, {
        overrides: {
          loginService: customMock,
        },
      });

      expect(mocks['loginService']).toBe(customMock);
      expect(mocks['userService']).toBeDefined();
      expect(mocks['userService']).not.toBe(customMock);
    });
  });

  describe('expression-based injections', () => {
    test('should not throw for services with ulak() injections', () => {
      // Regression: previously threw "TypeError: ulak.namespace is not a function"
      const { instance, mocks } = mockComponent(StatsService);

      expect(instance).toBeInstanceOf(StatsService);
      expect(mocks['statsChannel']).toBeDefined();
    });

    test('should auto-mock ulak fields with an assertable deep mock', async () => {
      const { instance, mocks } = mockComponent(StatsService);

      await instance.publishStats({ action: 'update', data: { newUser: 1 } });

      expect(mocks['statsChannel'].broadcast).toHaveBeenCalledTimes(1);
      expect(mocks['statsChannel'].broadcast).toHaveBeenCalledWith({ action: 'update', data: { newUser: 1 } });
    });

    test('should use ulak overrides as-is without applying the expression', async () => {
      // Regression: previously the expression ran ON TOP of the override
      const stub = createTestUlakStub('/stats');

      const { instance, mocks } = mockComponent(StatsService, {
        overrides: {
          statsChannel: stub,
          userService: { createUser: mock(async (name: string, email: string) => ({ id: '1', name, email })) },
        },
      });

      expect(mocks['statsChannel']).toBe(stub);
      expect((instance as any).statsChannel).toBe(stub);

      await instance.createAnonUser('John');

      expect(stub.broadcast).toHaveBeenCalledWith({ action: 'update', data: { newUser: 1 } });
    });

    test('should auto-mock plain expression fields', async () => {
      const { instance, mocks } = mockComponent(ServiceWithExpression);

      mocks['createUserFn'].mockResolvedValue({ id: '1', name: 'John' });

      const result = await instance.addUser('John', 'john@example.com');

      expect(result).toEqual({ id: '1', name: 'John' });
      expect(mocks['createUserFn']).toHaveBeenCalledWith('John', 'john@example.com');
    });

    test('should use overrides as-is for plain expression fields', async () => {
      const createUserFn = mock(async () => ({ id: '9', name: 'Custom' }));

      const { instance, mocks } = mockComponent(ServiceWithExpression, {
        overrides: { createUserFn },
      });

      expect(mocks['createUserFn']).toBe(createUserFn);

      const result = await instance.addUser('John', 'john@example.com');

      expect(result).toEqual({ id: '9', name: 'Custom' });
    });

    test('should respect the injections filter for expression fields', () => {
      const { instance: untouched } = mockComponent(StatsService, { injections: [] });

      expect((untouched as any).statsChannel).toBeUndefined();

      const { instance, mocks } = mockComponent(StatsService, { injections: ['statsChannel'] });

      expect(mocks['statsChannel']).toBeDefined();
      expect(mocks['userService']).toBeUndefined();
      expect((instance as any).userService).toBeUndefined();
    });
  });

  describe('falsy overrides', () => {
    test('should inject falsy override values as-is', () => {
      const { instance } = mockComponent(AuthService, {
        overrides: { userService: null, loginService: '' },
      });

      expect((instance as any).userService).toBeNull();
      expect((instance as any).loginService).toBe('');
    });

    test('should respect explicit undefined overrides', () => {
      const { instance, mocks } = mockComponent(StatsService, {
        overrides: { statsChannel: undefined },
      });

      // Field is present in overrides, so no expression runs and no auto-mock is generated
      expect((instance as any).statsChannel).toBeUndefined();
      expect(Object.hasOwn(mocks, 'statsChannel')).toBe(true);
    });

    test('should not apply expressions to falsy overrides', () => {
      expect(() => {
        mockComponent(StatsService, {
          overrides: { statsChannel: null },
        });
      }).not.toThrow();
    });
  });

  describe('options.postConstruct', () => {
    test('should call postConstruct hook after injection', () => {
      let hookCalled = false;
      let receivedInstance: any = null;

      const { instance } = mockComponent(AuthService, {
        postConstruct: (inst) => {
          hookCalled = true;
          receivedInstance = inst;
        },
      });

      expect(hookCalled).toBe(true);
      expect(receivedInstance).toBe(instance);
    });

    test('should have access to instance in postConstruct', () => {
      const { instance } = mockComponent(AuthService, {
        postConstruct: (inst) => {
          expect(inst).toBeInstanceOf(AuthService);
          expect((inst as any).userService).toBeDefined();
          expect((inst as any).loginService).toBeDefined();
        },
      });

      expect(instance).toBeInstanceOf(AuthService);
    });
  });

  describe('mockComponentAsync', () => {
    test('should handle async postConstruct', async () => {
      let asyncHookCalled = false;

      const { instance } = await mockComponentAsync(AuthService, {
        postConstruct: async (_inst) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          asyncHookCalled = true;
        },
      });

      expect(asyncHookCalled).toBe(true);
      expect(instance).toBeInstanceOf(AuthService);
    });

    test('should return promise for async postConstruct', async () => {
      const result = mockComponentAsync(AuthService, {
        postConstruct: async (_inst) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      });

      expect(result).toBeInstanceOf(Promise);
      const { instance } = await result;
      expect(instance).toBeInstanceOf(AuthService);
    });
  });

  describe('edge cases', () => {
    test('should throw error for non-class input', () => {
      expect(() => {
        mockComponent(null as any);
      }).toThrow('mockComponent expects a class constructor');
    });

    test('should handle components with no dependencies', () => {
      const { instance, mocks } = mockComponent(UserService);

      expect(instance).toBeInstanceOf(UserService);
      expect(Object.keys(mocks).length).toBe(0);
    });

    test('should handle combined options', () => {
      const customLoginMock = {
        login: async () => ({ token: 'custom', userId: '999' }),
      };

      let hookCalled = false;

      const { mocks } = mockComponent(AuthService, {
        injections: ['userService', 'loginService'],
        overrides: {
          loginService: customLoginMock,
        },
        postConstruct: (inst) => {
          hookCalled = true;
          expect(inst).toBeInstanceOf(AuthService);
        },
      });

      expect(hookCalled).toBe(true);
      expect(mocks['loginService']).toBe(customLoginMock);
      expect(mocks['userService']).toBeDefined();
    });

    test('should mock both inherited and own dependencies', () => {
      @Component()
      class LoggerService {
        log(_message: string) {
          return 'logged';
        }
      }

      @Component()
      class DatabaseService {
        query(_sql: string) {
          return 'result';
        }
      }

      @Component()
      class BaseService {
        @Inject(LoggerService)
        protected logger!: LoggerService;
      }

      @Component()
      class UserService extends BaseService {
        @Inject(DatabaseService)
        // @ts-ignore
        private database!: DatabaseService;
      }

      const { instance, mocks } = mockComponent(UserService);

      // Both inherited and own dependencies should be mocked
      expect(mocks['logger']).toBeDefined();
      expect(mocks['database']).toBeDefined();
      expect((instance as any).logger).toBe(mocks['logger']);
      expect((instance as any).database).toBe(mocks['database']);
    });
  });
});
