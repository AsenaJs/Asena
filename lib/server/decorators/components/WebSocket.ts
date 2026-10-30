import { ComponentConstants, ComponentType, type ControllerParams } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';
import { assertPathGiven, defineMiddleware } from '../../web/helper';
import { defineTypedMetadata } from '../../../utils/typedMetadata';

import type { MiddlewareClass } from '../../web/middleware';

/**
 * Decorator for defining a WebSocket component.
 *
 * @param {ControllerParams | string} [params] - Optional parameters for the WebSocket. A string can be used for defining the path.
 * @returns {ClassDecorator} - The class decorator for the WebSocket.
 */
export const WebSocket = (params: ControllerParams | string): ClassDecorator => {
  const path = typeof params === 'string' ? params : params?.path;

  const decorate = defineComponent(ComponentType.WEBSOCKET, params, (target) => {
    defineTypedMetadata<string>(ComponentConstants.PathKey, path.replace(/^\/+/, ''), target);

    defineMiddleware(target, (params as ControllerParams).middlewares || []);

    defineTypedMetadata<MiddlewareClass[]>(
      ComponentConstants.MiddlewaresKey,
      (params as ControllerParams).middlewares || [],
      target,
    );
  });

  return (target) => {
    assertPathGiven('@WebSocket', target, path || undefined);
    decorate(target);
  };
};
