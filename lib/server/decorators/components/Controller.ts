import { ComponentType, type ControllerParams } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';
import { defineMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../../ioc/constants';
import { defineMiddleware } from '../../web/helper';

/**
 * Decorator for defining a Controller component. String is used for defining the path.
 *
 * @param {ControllerParams | string} [params] - Optional parameters for the controller.
 * @returns {ClassDecorator} - The class decorator for the controller.
 */
export const Controller = (params?: ControllerParams | string): ClassDecorator => {
  const _params =
    typeof params === 'string' ? { path: params, name: undefined } : params || { path: '', name: undefined };

  return defineComponent(ComponentType.CONTROLLER, _params, (target) => {
    defineMetadata(ComponentConstants.PathKey, (_params as ControllerParams).path.replace(/^\/+/, '/') || '/', target);

    defineMiddleware(target, (_params as ControllerParams).middlewares || []);

    defineMetadata(ComponentConstants.MiddlewaresKey, (_params as ControllerParams).middlewares || [], target);
  });
};
