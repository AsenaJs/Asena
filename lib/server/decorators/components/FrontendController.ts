import { ComponentConstants, ComponentType } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';
import { defineTypedMetadata } from '../../../utils/typedMetadata';

export interface FrontendControllerParams {
  path: string;
  name?: string;
}

/**
 * Decorator for defining a Frontend Controller component.
 * Frontend controllers serve HTML bundles via Bun's native HTML import feature.
 * String parameter is used for defining the base path.
 *
 * HTML routes bypass the middleware chain entirely and are served directly by Bun.serve().
 *
 * @param {FrontendControllerParams | string} params - Base path or full params
 * @returns {ClassDecorator}
 */
export const FrontendController = (params: FrontendControllerParams | string): ClassDecorator => {
  const _params =
    typeof params === 'string' ? { path: params, name: undefined } : params || { path: '', name: undefined };

  return defineComponent(ComponentType.FRONTEND_CONTROLLER, _params, (target) => {
    defineTypedMetadata<string>(ComponentConstants.PathKey, _params.path.replace(/^\/+/, '/') || '/', target);
  });
};
