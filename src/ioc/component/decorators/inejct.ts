import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import type { Class } from '../../../server/types/Class';
import { DependencyKey, StrategyKey } from '../../constants';
import type { Injectable, Strategies } from '../../types';

export const Inject = (Injection: Class | string): PropertyDecorator => {
  return (target: Object, propertyKey: string) => {
    const dependencies: Injectable = getMetadata(DependencyKey, target.constructor) || {};

    defineMetadata('design:type', Injection, target, propertyKey);

    if (typeof Injection === 'string') {
      const strategies: Strategies = getMetadata(StrategyKey, target.constructor) || {};

      if (!strategies[propertyKey]) {
        strategies[propertyKey] = Injection;
      }

      defineMetadata(StrategyKey, strategies, target.constructor);
    } else {
      if (!dependencies[propertyKey]) {
        dependencies[propertyKey] = Injection;
      }

      defineMetadata(DependencyKey, dependencies, target.constructor);
    }
  };
};
