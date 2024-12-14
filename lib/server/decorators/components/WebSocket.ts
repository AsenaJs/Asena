import { ComponentType, type ControllerParams } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';
import { ComponentConstants } from '../../../ioc/constants';
import { defineMiddleware } from '../../web/helper';
import { defineTypedMetadata } from '../../../utils/typedMetadata';
import type { MiddlewareClass } from '../../types';

/**
 * Decorator for defining a WebSocket component.
 *
 * @param {ControllerParams | string} [params] - Optional parameters for the WebSocket. A string can be used for defining the path.
 * @returns {ClassDecorator} - The class decorator for the WebSocket.
 */
export const WebSocket = (params: ControllerParams | string): ClassDecorator => {
  return defineComponent(ComponentType.WEBSOCKET, params, (target) => {
    let path = typeof params === 'string' ? params : params.path;

    path = path.replace(/^\/+/, '');

    defineTypedMetadata<string>(ComponentConstants.PathKey, path, target);

    defineMiddleware(target, (params as ControllerParams).middlewares || []);

    defineTypedMetadata<MiddlewareClass[]>(
      ComponentConstants.MiddlewaresKey,
      (params as ControllerParams).middlewares || [],
      target,
    );
  });
};
