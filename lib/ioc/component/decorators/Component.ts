import { type ComponentParams, ComponentType } from '../../types';
import { defineComponent } from '../componentUtils';

/**
 * Decorator for defining a generic Component.
 *
 * @param {ComponentParams | string} [params] - Optional parameters for the component. A string can be used for defining the name.
 * @returns {ClassDecorator} - The class decorator for the component.
 */
export const Component = (params?: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.COMPONENT, params);
};
