import type { MockComponentOptions, MockedComponent } from './types';
import { discoverInjectedFields } from './metadata/discovery';
import { createMockFromClass } from './factory/mockFactory';
import { createDeepMock } from './factory/deepMock';

/**
 * Creates a test instance of a component with all @Inject dependencies automatically mocked
 *
 * This is the main API for testing Asena components. It discovers all @Inject decorated
 * fields, generates mock objects for them, and injects them into a new instance.
 *
 * What each field receives depends on how it was injected:
 * - `@Inject(UserService)` - a mock shaped like the class: every method becomes a bun mock
 * - `@Inject(ulak('/chat'))` and other expression injections - the expression is evaluated
 *   against a deep mock, so any call chain works and every call stays assertable
 * - `@Inject('UserService')` - a plain `{}`, because a string carries no class reference.
 *   Pass `overrides` for those fields.
 *
 * @template T - Type of the component being mocked
 * @param ComponentClass - Component class to instantiate and mock
 * @param options - Optional configuration for mocking behavior
 * @returns Object containing the component instance and all mocked dependencies
 *
 * @example
 * ```typescript
 * import { mockComponent } from '@asenajs/asena';
 * import { describe, test, expect, beforeEach } from 'bun:test';
 *
 * describe('AuthService', () => {
 *   let authService: AuthService;
 *   let mocks: Record<string, any>;
 *
 *   beforeEach(() => {
 *     const result = mockComponent(AuthService);
 *     authService = result.instance;
 *     mocks = result.mocks;
 *   });
 *
 *   test('register should create user', async () => {
 *     mocks.userService.createUser.mockResolvedValue({
 *       id: 'user-123',
 *       name: 'John Doe'
 *     });
 *
 *     const result = await authService.register('John', 'john@example.com', 'pass');
 *
 *     expect(result.user.id).toBe('user-123');
 *     expect(mocks.userService.createUser).toHaveBeenCalledTimes(1);
 *   });
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With options - selective mocking
 * const { instance, mocks } = mockComponent(PaymentService, {
 *   injections: ['stripeClient'],
 *   overrides: {
 *     stripeClient: myCustomStripeMock
 *   },
 *   postConstruct: (inst) => {
 *     console.log('Test instance ready');
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Expression-based injections (e.g. the ulak() helper) work automatically:
 * // the expression is evaluated against a deep mock, so the field behaves
 * // like a real namespace and every method call is assertable
 * const { instance, mocks } = mockComponent(ChatService);
 *
 * await instance.sendAnnouncement('hello');
 *
 * expect(mocks.chat.broadcast).toHaveBeenCalledWith({ type: 'announcement', text: 'hello' });
 *
 * // A field present in overrides is used as-is - its expression is skipped
 * const stub = createTestUlakStub('/chat');
 * const { instance: withStub } = mockComponent(ChatService, {
 *   overrides: { chat: stub },
 * });
 * ```
 */
export function mockComponent<T extends object>(
  ComponentClass: new (...args: any[]) => T,
  options: MockComponentOptions = {},
): MockedComponent<T> {
  if (!ComponentClass || typeof ComponentClass !== 'function') {
    throw new Error(`mockComponent expects a class constructor, but received: ${typeof ComponentClass}`);
  }

  const instance = new ComponentClass();
  const allInjectedFields = discoverInjectedFields(instance);

  const fieldsToMock = options.injections
    ? allInjectedFields.filter((field) => options.injections.includes(field.fieldName))
    : allInjectedFields;

  const mocks: Record<string, any> = {};

  for (const field of fieldsToMock) {
    const { fieldName, expression, serviceClass } = field;

    let mockValue: any;

    if (options.overrides && Object.hasOwn(options.overrides, fieldName)) {
      // Overrides are the FINAL field value: the expression is intentionally
      // skipped and falsy values (0, '', null) are respected
      mockValue = options.overrides[fieldName];
    } else if (expression) {
      // Expression fields (e.g. @Inject(ulak('/chat'))) receive a deep mock
      // so any call chain the expression performs works without a running app
      mockValue = expression(createDeepMock());
    } else {
      // Class injections (@Inject(UserService)) get a mock shaped like the real class:
      // every method becomes a bun mock. String injections (@Inject('UserService'))
      // carry no class reference, so they degrade to {} and need an explicit override
      mockValue = createMockFromClass(serviceClass);
    }

    (instance as any)[fieldName] = mockValue;
    mocks[fieldName] = mockValue;
  }

  if (options.postConstruct) {
    const result = options.postConstruct(instance);

    if (result instanceof Promise) {
      return result.then(() => ({ instance, mocks })) as any;
    }
  }

  return { instance, mocks };
}

/**
 * Async version of mockComponent for components with async postConstruct
 * Use this when your postConstruct hook is async
 *
 * @template T - Type of the component being mocked
 * @param ComponentClass - Component class to instantiate and mock
 * @param options - Optional configuration for mocking behavior
 * @returns Promise resolving to object containing the component instance and mocked dependencies
 *
 * @example
 * ```typescript
 * const { instance, mocks } = await mockComponentAsync(DatabaseService, {
 *   postConstruct: async (inst) => {
 *     await inst.initialize();
 *   }
 * });
 * ```
 */
export async function mockComponentAsync<T extends object>(
  ComponentClass: new (...args: any[]) => T,
  options: MockComponentOptions = {},
): Promise<MockedComponent<T>> {
  const result = mockComponent(ComponentClass, options);

  if (result instanceof Promise) {
    return result;
  }

  return result;
}
