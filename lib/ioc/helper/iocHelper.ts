import type { InjectableComponent } from '../types';
import { getTypedMetadata } from '../../utils/typedMetadata';
import { ComponentConstants } from '../constants';

// make it proper class
export const getStrategyClass = (
  interfaceNames: Record<string, string>,
  injectables: InjectableComponent[],
): string[] => {
  if (!interfaceNames) return [];

  const strategies = Object.values(interfaceNames);

  return injectables
    .filter((injectable) => strategies.includes(injectable.interface))
    .map((injectable) => getTypedMetadata<string>(ComponentConstants.NameKey, injectable.Class));
};
