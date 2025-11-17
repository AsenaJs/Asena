import { describe, expect, mock, test } from 'bun:test';
import { mockComponent, mockComponentAsync } from '@asenajs/asena/test';
import { Component } from '@asenajs/asena/server';
import { Inject } from '@asenajs/asena/ioc';

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
