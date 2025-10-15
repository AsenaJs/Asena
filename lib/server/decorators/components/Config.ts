import { type ComponentParams, ComponentType } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';

/**
 * Decorator that marks a class as a configuration component.
 * Used to define configuration classes that can be injected into other components.
 *
 * @param {ComponentParams | string} params - Component parameters or component name
 * @returns {ClassDecorator} A class decorator that registers the class as a config component
 *
 */
export const Config = (params?: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.CONFIG, params);
};
