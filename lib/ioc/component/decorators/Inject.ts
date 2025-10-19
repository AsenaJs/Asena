import type { Class } from '../../../server/types';
import type { Dependencies, Expressions } from '../../types';
import { ComponentConstants } from '../../constants';
import { defineTypedMetadata, getOwnTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';

/**
 * Property decorator to inject a dependency.
 *
 * Supports three syntaxes:
 * 1. Class injection: `@Inject(UserService)`
 * 2. String injection with expression: `@Inject('UserService', (s) => s.getUsers())`
 * 3. Tuple injection (helper pattern): `@Inject(ulak('/chat'))` where ulak() returns [serviceName, expression]
 *
 * @param {Class | string | readonly [string, (injectedClass: any) => any]} Injection - The dependency to inject
 * @param expression - Optional expression to evaluate on the injected class (only used with Class or string)
 * @returns {PropertyDecorator} - The property decorator function
 *
 * @example
 * ```typescript
 * // Class injection
 * @Inject(UserService)
 * private userService: UserService;
 *
 * // String injection with expression
 * @Inject('UserService', (s) => s.getAllUsers())
 * private users: User[];
 *
 * // Tuple injection (helper pattern)
 * @Inject(ulak('/chat'))
 * private chat: Ulak.NameSpace<'/chat'>;
 * ```
 */
export const Inject = (
  Injection: Class | string | readonly [string, (injectedClass: any) => any],
  expression?: (injectedClass: any) => any,
): PropertyDecorator => {
  return (target: object, propertyKey: string): void => {
    let dependencyName: string;
    let resolvedExpression: ((injectedClass: any) => any) | undefined = expression;

    // Check if Injection is a tuple [serviceName, expression]
    if (Array.isArray(Injection) && Injection.length === 2) {
      const [name, tupleExpression] = Injection;

      dependencyName = name;
      resolvedExpression = tupleExpression;
    } else if (typeof Injection === 'string') {
      dependencyName = Injection;
    } else {
      // Injection is a Class
      dependencyName = getTypedMetadata<string>(ComponentConstants.NameKey, Injection);
    }

    // Store dependency
    const dependencies: Dependencies =
      getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, target.constructor) || {};

    if (!dependencies[propertyKey]) {
      dependencies[propertyKey] = dependencyName;
    }

    defineTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, dependencies, target.constructor);

    // Store expression if provided
    if (resolvedExpression) {
      const expressions: Expressions =
        getOwnTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, target.constructor) || {};

      if (!expressions[propertyKey]) {
        expressions[propertyKey] = resolvedExpression;
      }

      defineTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, expressions, target.constructor);
    }
  };
};
