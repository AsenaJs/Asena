import type { Dependencies } from '../../../ioc';
import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';
import type { MiddlewareClass } from '../middleware';

/**
 * Defines middlewares for target class.
 *
 * @param {Function} target - The target class to which the middleware will be applied.
 * @param {MiddlewareClass[]} middlewares - An array of middleware classes to be defined.
 */
export const defineMiddleware = (target: object, middlewares: MiddlewareClass[]): void => {
  const deps: Dependencies =
    getOwnTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, target.constructor) || {};

  for (const middleware of middlewares) {
    const keys = Object.keys(deps);

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, middleware) || middleware.name;

    if (!keys.includes(name)) {
      deps[name] = name;
    }
  }

  defineTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, deps, target);
};
