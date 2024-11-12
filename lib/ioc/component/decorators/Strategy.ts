import type { Class } from '../../../server/types';
import type { Expression, Strategies } from '../../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../constants';

/**
 * Property decorator to define a strategy.
 *
 * @param {Class | string} Injection - The class of component to inject.
 * @param expression - The expression to evaluate on the injected class.
 * @returns {PropertyDecorator} - The property decorator function.
 */
export const Strategy = (Injection: Class | string, expression?: (injectedClass) => any): PropertyDecorator => {
  return (target: Object, propertyKey: string) => {
    const strategies: Strategies = getMetadata(ComponentConstants.StrategyKey, target.constructor) || {};

    defineMetadata('design:type', Injection, target, propertyKey);

    const injectionName = typeof Injection === 'string' ? Injection : Injection.name;

    if (!strategies[propertyKey]) {
      strategies[propertyKey] = injectionName;
    }

    if (expression) {
      const expressions: Expression = getMetadata(ComponentConstants.ExpressionKey, target.constructor) || {};

      if (!expressions[propertyKey]) {
        expressions[propertyKey] = expression;
      }

      defineMetadata(ComponentConstants.ExpressionKey, expressions, target.constructor);
    }

    defineMetadata(ComponentConstants.StrategyKey, strategies, target.constructor);
  };
};
