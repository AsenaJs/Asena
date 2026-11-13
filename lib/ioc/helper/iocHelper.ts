import type { InjectableComponent } from '../types';
import { getTypedMetadata } from '../../utils/typedMetadata';
import { ComponentConstants } from '../constants';
import type { Class } from '../../server/types';

// A class-based @Inject is looked up by the dependency's registered name, not the name frozen at decoration time.
export const resolveDependencyName = (frozenName: string, dependencyClass: Class | undefined): string =>
  dependencyClass
    ? (getTypedMetadata<string>(ComponentConstants.NameKey, dependencyClass) ?? dependencyClass.name)
    : frozenName;

// make it proper class
export const getStrategyClass = (
  interfaceNames: Record<string, string> | undefined,
  injectables: InjectableComponent[],
): string[] => {
  if (!interfaceNames) return [];

  const strategies = Object.values(interfaceNames);

  return injectables
    .filter((injectable) => strategies.some((strategy) => strategy === injectable.interface))
    .map(
      (injectable) => getTypedMetadata<string>(ComponentConstants.NameKey, injectable.Class) || injectable.Class.name,
    );
};
