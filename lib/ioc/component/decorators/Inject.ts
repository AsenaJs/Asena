import type { Class } from '../../../server/types';
import type { Expressions, Dependencies } from '../../types';
import { ComponentConstants } from '../../constants';
import { defineTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';

/**
 * Property decorator to inject a dependency.
 *
 * @param {Class } Injection - The class of component to inject.
 * @param expression - The expression to evaluate on the injected class.
 * @returns {PropertyDecorator} - The property decorator function.
 */
export const Inject = (Injection: Class | string, expression?: (injectedClass: any) => any): PropertyDecorator => {
  return (target: object, propertyKey: string): void => {
    const dependencies: Dependencies =
      getTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, target.constructor) || {};

    if (!dependencies[propertyKey]) {
      dependencies[propertyKey] = typeof Injection === 'string' ? Injection : Injection.name;
    }

    defineTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, dependencies, target.constructor);

    if (expression) {
      const expressions: Expressions =
        getTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, target.constructor) || {};

      if (!expressions[propertyKey]) {
        expressions[propertyKey] = expression;
      }

      defineTypedMetadata<Expressions>(ComponentConstants.ExpressionKey, expressions, target.constructor);
    }
  };
};
