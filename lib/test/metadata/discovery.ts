import type { DependencyClasses, Dependencies, Expressions } from '../../ioc';
import type { FieldMetadata } from '../types';
import { ComponentConstants } from '../../ioc';
import { getTypedMetadata, getOwnTypedMetadata } from '../../utils';

/**
 * Discovers all fields with @Inject decorator in a component
 * Traverses prototype chain to support inheritance
 *
 * @param instance - Component instance to inspect
 * @returns Array of field metadata containing field names, service names, and expressions
 *
 * @example
 * ```typescript
 * const fields = discoverInjectedFields(new AuthService());
 * // Returns: [
 * //   { fieldName: 'userService', serviceName: 'UserService', expression: undefined },
 * //   { fieldName: 'loginService', serviceName: 'LoginService', expression: (s) => s.login() }
 * // ]
 * ```
 */
export function discoverInjectedFields(instance: any): FieldMetadata[] {
  return discoverInjectedFieldsFromClass(Object.getPrototypeOf(instance)?.constructor);
}

/**
 * Discovers all fields with @Inject decorator in a component class
 * Traverses the constructor chain to support inheritance - no instantiation required
 *
 * This is the class-based counterpart of {@link discoverInjectedFields}. It is what
 * slice tests use, since they must inspect a component's dependencies before deciding
 * whether to register it for real or replace it with a mock.
 *
 * @param ComponentClass - Component class to inspect
 * @returns Array of field metadata containing field names, service names, class refs and expressions
 *
 * @example
 * ```typescript
 * const fields = discoverInjectedFieldsFromClass(AuthService);
 * // Returns: [
 * //   { fieldName: 'userService', serviceName: 'UserService', serviceClass: UserService },
 * //   { fieldName: 'chat', serviceName: '__Ulak__', expression: (u) => u.namespace('/chat') }
 * // ]
 * ```
 */
export function discoverInjectedFieldsFromClass(ComponentClass: any): FieldMetadata[] {
  const fields: FieldMetadata[] = [];
  const processedFields = new Set<string>();

  let currentClass = ComponentClass;

  // Traverse the constructor chain (similar to how Container does it)
  while (currentClass && currentClass !== Function.prototype) {
    // Stop at native code - matches Container.getPrototypeChain behaviour
    if (typeof currentClass !== 'function' || currentClass.toString().includes('[native code]')) {
      break;
    }

    // Get dependencies metadata for this level
    const dependencies = getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, currentClass);

    // Get injected class references for this level (class-based injections only)
    const dependencyClasses = getOwnTypedMetadata<DependencyClasses>(
      ComponentConstants.DependencyClassKey,
      currentClass,
    );

    // Get expressions metadata for this level
    const expressions = getOwnTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, currentClass);

    if (dependencies) {
      // Process each dependency field
      for (const [fieldName, serviceName] of Object.entries(dependencies)) {
        // Skip if already processed (child class overrides)
        if (processedFields.has(fieldName)) {
          continue;
        }

        processedFields.add(fieldName);

        fields.push({
          fieldName,
          serviceName,
          serviceClass: dependencyClasses?.[fieldName],
          expression: expressions?.[fieldName],
        });
      }
    }

    // Move up the constructor chain
    currentClass = Object.getPrototypeOf(currentClass);
  }

  return fields;
}

/**
 * Checks if a component has any injected dependencies
 *
 * @param ComponentClass - Component class to check
 * @returns True if component has @Inject decorated fields
 *
 * @example
 * ```typescript
 * if (hasInjectedFields(AuthService)) {
 *   console.log('AuthService has dependencies');
 * }
 * ```
 */
export function hasInjectedFields(ComponentClass: new (...args: any[]) => any): boolean {
  const dependencies = getTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, ComponentClass);
  return dependencies !== undefined && Object.keys(dependencies).length > 0;
}

/**
 * Gets the service name for a specific field
 *
 * @param ComponentClass - Component class
 * @param fieldName - Name of the field
 * @returns Service name if field is injected, undefined otherwise
 *
 * @internal
 */
export function getFieldServiceName(
  ComponentClass: new (...args: any[]) => any,
  fieldName: string,
): string | undefined {
  const dependencies = getTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, ComponentClass);
  return dependencies?.[fieldName];
}

/**
 * Gets the expression function for a specific field
 *
 * @param ComponentClass - Component class
 * @param fieldName - Name of the field
 * @returns Expression function if defined, undefined otherwise
 *
 * @internal
 */
export function getFieldExpression(
  ComponentClass: new (...args: any[]) => any,
  fieldName: string,
): ((service: any) => any) | undefined {
  const expressions = getTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, ComponentClass);
  return expressions?.[fieldName];
}
