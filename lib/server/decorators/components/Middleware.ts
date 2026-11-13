import type { MiddlewareParams } from '../../../ioc/types/decorators/MiddlewareParams';
import { defineComponent } from '../../../ioc/component';
import { ComponentConstants, ComponentType } from '../../../ioc';
import { defineTypedMetadata } from '../../../utils/typedMetadata';
import { VALIDATOR_KEYS } from '../../../adapter/types/validatorKeys';

/**
 * Decorator for defining a Middleware component.
 *
 * @param {MiddlewareParams} [params] - Optional parameters for the middleware.
 * @returns {ClassDecorator} - The class decorator for the middleware.
 */
export const Middleware = (params?: MiddlewareParams): ClassDecorator => {
  const decorate = defineComponent(ComponentType.MIDDLEWARE, params, (target) => {
    defineTypedMetadata<boolean>(ComponentConstants.ValidatorKey, params?.validator || false, target);
  });

  return (target) => {
    assertMiddlewareDefinition(target, params?.validator || false);
    decorate(target);
  };
};

const assertMiddlewareDefinition = (target: Function, validator: boolean): void => {
  if (validator) {
    const hasValidatorMethod = VALIDATOR_KEYS.some((method) => typeof target.prototype[method] === 'function');

    if (!hasValidatorMethod) {
      throw new Error(
        `Class ${target.name} must implement at least one of the validator methods: ${VALIDATOR_KEYS.join(', ')}.`,
      );
    }
  } else if (typeof target.prototype.handle !== 'function') {
    throw new Error(`Class ${target.name} must implement a 'handle(context, next)' method.`);
  }
};
