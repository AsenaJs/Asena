import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import type { Class } from '../../../server/types';
import type { Expression, Injectable } from '../../types';
import { ComponentConstants } from '../../constants';

/**
 * Property decorator to inject a dependency.
 *
 * @param {Class } Injection - The class of component to inject.
 * @param expression - The expression to evaluate on the injected class.
 * @returns {PropertyDecorator} - The property decorator function.
 */
export const Inject = (Injection: Class, expression?: (injectedClass:any) => any): PropertyDecorator => {
  return (target: object, propertyKey: string):void => {
    const dependencies: Injectable = getMetadata(ComponentConstants.DependencyKey, target.constructor) || {};

    defineMetadata('design:type', Injection, target, propertyKey);

    if (!dependencies[propertyKey]) {
      dependencies[propertyKey] = Injection;
    }

    defineMetadata(ComponentConstants.DependencyKey, dependencies, target.constructor);

    if (expression) {
      const expressions: Expression = getMetadata(ComponentConstants.ExpressionKey, target.constructor) || {};

      if (!expressions[propertyKey]) {
        expressions[propertyKey] = expression;
      }

      defineMetadata(ComponentConstants.ExpressionKey, expressions, target.constructor);
    }
  };
};
