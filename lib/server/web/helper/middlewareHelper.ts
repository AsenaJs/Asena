import type { Dependencies } from '../../../ioc';
import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils/typedMetadata';
import type { MiddlewareClass } from '../middleware';

/**
 * Defines middlewares for target class.
 *
 * @param {Function} target - The target class to which the middleware will be applied.
 * @param {MiddlewareClass[]} middlewares - An array of middleware classes to be defined.
 */
export const defineMiddleware = (target: object, middlewares: MiddlewareClass[]): void => {
  // Read from `target`, the same place the write below goes. Reading `target.constructor`
  // meant reading `Function`, which never holds this key - so every call started from an
  // empty record and overwrote the previous one. @Controller runs after the route decorators,
  // so route-level middlewares never made it into the soft dependencies at all.
  const deps: Dependencies = getOwnTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, target) || {};

  for (const middleware of middlewares) {
    const keys = Object.keys(deps);

    // Own-only, matching PrepareMiddlewareService. Off the chain an undecorated subclass
    // contributed its *base's* name here, so the soft-dependency graph described a middleware the
    // route does not actually use.
    const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, middleware) || middleware.name;

    if (!keys.includes(name)) {
      deps[name] = name;
    }
  }

  defineTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, deps, target);
};
