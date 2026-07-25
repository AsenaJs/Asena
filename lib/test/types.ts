/**
 * Options for configuring component mocking behavior
 */
export interface MockComponentOptions {
  /**
   * Only mock specific injected fields (optional)
   * If not provided, all @Inject decorated fields will be mocked
   *
   * @example
   * ```typescript
   * mockComponent(AuthService, {
   *   injections: ['userService'] // Only mock userService
   * })
   * ```
   */
  injections?: string[];

  /**
   * Provide custom mocks instead of auto-generated ones (optional)
   *
   * An override is the FINAL value injected into the field. For expression-based
   * injections (e.g. @Inject(ulak('/chat'))) the expression is skipped entirely
   * when the field is overridden. Presence is checked with Object.hasOwn, so
   * falsy values (0, '', null, undefined) are injected as-is rather than ignored.
   *
   * @example
   * ```typescript
   * mockComponent(AuthService, {
   *   overrides: {
   *     userService: myCustomMock
   *   }
   * })
   * ```
   */
  overrides?: Record<string, any>;

  /**
   * Lifecycle hook called after dependency injection (optional)
   * Can be async
   *
   * @example
   * ```typescript
   * mockComponent(AuthService, {
   *   postConstruct: (instance) => {
   *     // Setup after injection
   *   }
   * })
   * ```
   */
  postConstruct?: (instance: any) => void | Promise<void>;
}

/**
 * Result of mockComponent function
 */
export interface MockedComponent<T> {
  /**
   * Component instance with mocked dependencies
   */
  instance: T;

  /**
   * Object containing all mocked dependencies
   * Keys are field names, values are mock objects
   *
   * @example
   * ```typescript
   * const { instance, mocks } = mockComponent(AuthService);
   * mocks.userService.createUser.mockResolvedValue({...});
   * ```
   */
  mocks: Record<string, any>;
}

/**
 * Internal type for field metadata discovery
 * @internal
 */
export interface FieldMetadata {
  /**
   * Name of the field
   */
  fieldName: string;

  /**
   * Service name (from @Inject decorator)
   */
  serviceName: string;

  /**
   * Class reference the field was injected with.
   *
   * Only present for class-based injections (`@Inject(UserService)`). String-based
   * injections (`@Inject('UserService')`) carry no class reference, so this is
   * undefined and auto-mocking degrades to an empty object.
   */
  serviceClass?: any;

  /**
   * Optional expression function for transformation
   */
  expression?: (service: any) => any;
}

/**
 * Type alias for mock factory function
 * @internal
 */
export type MockFactory = (classType: any) => any;
