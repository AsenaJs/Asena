import type { Component } from '../types';
import type { Class } from '../../server/types';

interface StringMap {
  [key: string]: string;
}
// make it proper class
export const getStrategyClass = (interfaceNames: StringMap, injectables: Component[]): Class[] => {
  if (!interfaceNames) return [];

  const strategies = Object.values(interfaceNames);

  return injectables
    .filter((injectable) => strategies.includes(injectable.interface))
    .map((injectable) => injectable.Class);
};
