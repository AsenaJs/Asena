import { ComponentConstants } from '../../ioc/constants';
import { defineTypedMetadata, getTypedMetadata } from '../../utils/typedMetadata';

/**
 * Decorator for marking a property as an override.
 *
 * Override properties allow a middleware to work directly without any Asena wrapper.
 *
 * For now, it's only using in middleware.
 *
 * @returns {ClassDecorator} - The property decorator for the override.
 */
export const Override = (): PropertyDecorator => {
  return (target: object, propertyKey: string) => {
    const overrides: string[] = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, target) || [];

    if (!overrides.includes(propertyKey)) {
      overrides.push(propertyKey);
    }

    defineTypedMetadata<string[]>(ComponentConstants.OverrideKey, overrides, target);
  };
};
