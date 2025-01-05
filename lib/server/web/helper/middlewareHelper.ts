import type { Dependencies } from '../../../ioc/types';
import { ComponentConstants } from '../../../ioc/constants';
import { defineTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';
import type {MiddlewareClass} from "../middleware";

/**
 * Defines middlewares for target class.
 *
 * @param {Function} target - The target class to which the middleware will be applied.
 * @param {MiddlewareClass[]} middlewares - An array of middleware classes to be defined.
 */
export const defineMiddleware = (target: Function, middlewares: MiddlewareClass[]): void => {
  const deps: Dependencies = getTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, target) || {};

  for (const middleware of middlewares) {
    const keys = Object.keys(deps);

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, middleware);

    if (!keys.includes(name)) {
      deps[name] = name;
    }
  }

  defineTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, deps, target);
}