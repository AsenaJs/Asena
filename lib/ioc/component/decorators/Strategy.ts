import type { Class } from '../../../server/types';
import type { Expressions, Strategies } from '../../types';
import { ComponentConstants } from '../../constants';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils/typedMetadata';

/**
 * Property decorator to define a strategy.
 *
 * @param {Class | string} Injection - The class of component to inject.
 * @param expression - The expression to evaluate on the injected class.
 * @returns {PropertyDecorator} - The property decorator function.
 */
export const Strategy = (Injection: Class | string, expression?: (injectedClass) => any): PropertyDecorator => {
  return (target: Object, propertyKey: string) => {
    const strategies: Strategies = getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, target.constructor) || {};

    defineTypedMetadata<Class | string>('design:type', Injection, target.constructor, propertyKey);

    const injectionName = typeof Injection === 'string' ? Injection : Injection.name;

    if (!strategies[propertyKey]) {
      strategies[propertyKey] = injectionName;
    }

    if (expression) {
      const expressions: Expressions = getOwnTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, target.constructor) || {};

      if (!expressions[propertyKey]) {
        expressions[propertyKey] = expression;
      }

      defineTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, expressions, target.constructor);
    }

    defineTypedMetadata<Strategies>(ComponentConstants.StrategyKey, strategies, target.constructor);
  };
};
