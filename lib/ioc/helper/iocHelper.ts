import type { InjectableComponent } from '../types';
import { getTypedMetadata } from '../../utils/typedMetadata';
import { ComponentConstants } from '../constants';

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
