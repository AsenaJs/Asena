import { ComponentType, type ServiceParams } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';

/**
 * Decorator for defining a Service component.
 *
 * @param {ServiceParams | string} [params] - Optional parameters for the service. string is used for defining the name.
 * @returns {ClassDecorator} - The class decorator for the service.
 */
export const Service = (params?: ServiceParams | string): ClassDecorator => {
  return defineComponent(ComponentType.SERVICE, params);
};
