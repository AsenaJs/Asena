import type { Class } from '../../server/types';
import { ComponentConstants, ICoreServiceNames } from '../../ioc';
import { getOwnTypedMetadata, getTypedMetadata } from '../../utils';
import { discoverInjectedFieldsFromClass } from '../metadata/discovery';

/**
 * The name a component registers under - the same read the IoC engine performs at
 * registration time.
 */
const componentName = (componentClass: Class): string =>
  getTypedMetadata<string>(ComponentConstants.NameKey, componentClass) || componentClass.name;

/**
 * Expands an explicit component list with every class reachable from it through
 * `@Inject(Class)`, breadth-first.
 *
 * A test then names only the roots (typically its controllers) instead of the whole
 * injection closure by hand. Dependencies reached this way are registered **for real**;
 * an entry in `overrides` stops the walk, because the double replaces the real class.
 *
 * `@Strategy` fields are deliberately not followed: they live under `StrategyKey`, not
 * `DependencyKey`, and an empty strategy key is a legitimate plugin point injected as `[]`,
 * not a missing dependency.
 *
 * Anything the walk cannot satisfy - a name-injected dependency with no class reference
 * behind it, or an injected class that carries no component decorator - is collected, and
 * one error naming every problem is thrown before anything boots.
 *
 * @param components - The classes the caller listed, in order
 * @param overrides - Test doubles keyed by service name; the walk stops at these names
 * @returns The caller's classes first, then the discovered ones in discovery order,
 *   deduplicated by class identity
 * @throws An error starting with `createTestApp: missing dependencies:` listing every
 *   unsatisfiable injection as `<Owner>.<field> ...`
 */
export function expandComponents(components: Class[], overrides: Record<string, object>): Class[] {
  const coreServiceNames = new Set<string>(Object.values(ICoreServiceNames));
  const providedNames = new Set<string>();
  const seen = new Set<Class>();
  const result: Class[] = [];
  const queue: Class[] = [];
  const missing: string[] = [];

  const add = (componentClass: Class): void => {
    if (seen.has(componentClass)) {
      return;
    }

    seen.add(componentClass);
    result.push(componentClass);
    queue.push(componentClass);
    providedNames.add(componentName(componentClass));
  };

  for (const componentClass of components) {
    add(componentClass);
  }

  // for-of over the live array: classes appended mid-walk are visited, which is what makes
  // this a BFS without a second loop
  for (const owner of queue) {
    for (const { fieldName, serviceName, serviceClass } of discoverInjectedFieldsFromClass(owner)) {
      // The stored name is undefined when the dependency was decorated after the dependent:
      // @Inject reads NameKey at decoration time. Derive it from the class reference instead.
      const name = serviceName ?? (serviceClass ? componentName(serviceClass) : undefined);

      if (
        name !== undefined &&
        (coreServiceNames.has(name) || Object.hasOwn(overrides, name) || providedNames.has(name))
      ) {
        continue;
      }

      if (serviceClass) {
        if (!getOwnTypedMetadata(ComponentConstants.IOCObjectKey, serviceClass)) {
          missing.push(`${owner.name}.${fieldName} injects ${serviceClass.name}, which is not a decorated component`);

          continue;
        }

        add(serviceClass);

        continue;
      }

      missing.push(`${owner.name}.${fieldName} injects '${name}', which is not in components or overrides`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`createTestApp: missing dependencies:\n${missing.join('\n')}`);
  }

  return result;
}
