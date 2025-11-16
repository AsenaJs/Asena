import { mock } from 'bun:test';

/**
 * Detects all methods in a class (excluding constructor)
 *
 * @param classType - Class to inspect
 * @returns Array of method names
 *
 * @internal
 */
function detectClassMethods(classType: any): string[] {
  if (!classType?.prototype) {
    return [];
  }

  const methods: string[] = [];
  const prototype = classType.prototype;

  // Get all property names from prototype
  const propertyNames = Object.getOwnPropertyNames(prototype);

  for (const name of propertyNames) {
    // Skip constructor
    if (name === 'constructor') {
      continue;
    }

    // Check if it's a function
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor && typeof descriptor.value === 'function') {
      methods.push(name);
    }
  }

  return methods;
}

/**
 * Checks if a value is mockable (is a class with prototype)
 *
 * @param classType - Value to check
 * @returns True if value is a class
 *
 * @internal
 */
function isMockable(classType: any): boolean {
  return (
    classType !== null &&
    classType !== undefined &&
    typeof classType === 'function' &&
    classType.prototype !== undefined
  );
}

/**
 * Creates a mock object from a class type
 * Automatically generates Bun mock functions for all class methods
 *
 * @param classType - Class to create mock from
 * @returns Mock object with all methods mocked
 *
 * @example
 * ```typescript
 * const UserServiceMock = createMockFromClass(UserService);
 * // Returns:
 * // {
 * //   createUser: mock(async () => null),
 * //   findByEmail: mock(async () => null),
 * //   findById: mock(async () => null),
 * // }
 *
 * // Can configure mocks:
 * UserServiceMock.createUser.mockResolvedValue({ id: '123', name: 'John' });
 * ```
 */
export function createMockFromClass(classType: any): any {
  // Handle non-mockable types - return empty object as placeholder
  if (!isMockable(classType)) {
    return {};
  }

  // Detect all methods in the class
  const methods = detectClassMethods(classType);

  // Create mock object
  const mockObject: Record<string, any> = {};

  // Create Bun mock for each method
  for (const methodName of methods) {
    // Check if method is async by inspecting the original
    const originalMethod = classType.prototype[methodName];
    const isAsync = originalMethod?.constructor?.name === 'AsyncFunction';

    // Create mock with appropriate default return value
    if (isAsync) {
      // Async methods return Promise.resolve(null) by default
      mockObject[methodName] = mock(async () => null);
    } else {
      // Sync methods return undefined by default
      mockObject[methodName] = mock(() => undefined);
    }
  }

  return mockObject;
}

/**
 * Creates a simple spy that tracks calls without mocking behavior
 * Useful for partial mocking scenarios
 *
 * @returns Mock function that returns undefined
 *
 * @internal
 */
export function createSimpleSpy(): any {
  return mock(() => undefined);
}
