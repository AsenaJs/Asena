import type { Class } from '../../server/types';
import { ComponentConstants, ICoreServiceNames } from '../../ioc';
import { getTypedMetadata } from '../../utils';

/**
 * The name a component registers under - the same read the IoC engine performs at
 * registration time.
 */
export const componentName = (componentClass: Class): string =>
  getTypedMetadata<string>(ComponentConstants.NameKey, componentClass) || componentClass.name;

/**
 * Names wired during bootstrap, before any user component exists. They are always real:
 * never mocked by the harness, never walked as a dependency.
 */
export const CORE_SERVICE_NAMES: ReadonlySet<string> = new Set(Object.values(ICoreServiceNames));
