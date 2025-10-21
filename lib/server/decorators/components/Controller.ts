import { ComponentConstants, ComponentType, type ControllerParams } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';
import { defineMiddleware } from '../../web/helper';
import { defineTypedMetadata } from '../../../utils/typedMetadata';

import type { MiddlewareClass } from '../../web/middleware';

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
    defineTypedMetadata<string>(
      ComponentConstants.PathKey,
      (_params as ControllerParams).path.replace(/^\/+/, '/') || '/',
      target,
    );

    defineMiddleware(target, (_params as ControllerParams).middlewares || []);

    defineTypedMetadata<MiddlewareClass[]>(
      ComponentConstants.MiddlewaresKey,
      (_params as ControllerParams).middlewares || ([] as MiddlewareClass[]),
      target,
    );
  });
};
