import type { MiddlewareParams } from '../../../ioc/types/decorators/MiddlewareParams';
import { defineComponent } from '../../../ioc/component';
import { ComponentType } from '../../../ioc/types';
import { ComponentConstants } from '../../../ioc/constants';
import { VALIDATOR_METHODS } from '../../web/types';
import { defineTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';

/**
 * Decorator for defining a Middleware component.
 *
 * @param {MiddlewareParams} [params] - Optional parameters for the middleware.
 * @returns {ClassDecorator} - The class decorator for the middleware.
 */
export const Middleware = (params?: MiddlewareParams): ClassDecorator => {
  return defineComponent(ComponentType.MIDDLEWARE, params, (target) => {
    const overrides = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, target);

    defineTypedMetadata<string[]>(ComponentConstants.OverrideKey, overrides, target);
    // defineMetadata(ComponentConstants.OverrideKey, overdrive || params?.override || false, target);

    defineTypedMetadata<boolean>(ComponentConstants.ValidatorKey, params?.validator || false, target);

    if (params?.validator) {
      const hasValidatorMethod = VALIDATOR_METHODS.some((method) => typeof target.prototype[method] === 'function');

      if (!hasValidatorMethod) {
        console.error(
          `Class ${target.name} must implement at least one of the validator methods: ${VALIDATOR_METHODS.join(', ')}.`,
        );
        process.exit();
      }
    } else if (typeof target.prototype.handle !== 'function') {
      console.error(`Class ${target.name} must implement a 'handle(context, next)' method.`);
      process.exit();
    }
  });
};
