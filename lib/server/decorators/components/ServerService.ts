import { type ComponentParams, ComponentType } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';

/**
 * Decorator for defining a Server Service component.
 * This is a special type of service starts with the server.(e.g. DatabaseService, RedisService)
 *
 * @param {ComponentParams} [params] - Optional parameters for the server service.
 * @returns {ClassDecorator} - The class decorator for the server service.
 */
export const ServerService = (params?: ComponentParams): ClassDecorator => {
  return defineComponent(ComponentType.SERVER_SERVICE, params);
};
