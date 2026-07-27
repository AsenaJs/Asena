import type { AsenaMiddlewareService, MiddlewareClass } from '../../web/middleware';
import type { BaseMiddleware } from '../../../adapter';
import { getChainedTypedMetadataList, getOwnTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants, type Container, CoreService, type ICoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing middleware instances
 * Handles middleware resolution and preparation for routing
 */
@CoreService(ICoreServiceNames.PREPARE_MIDDLEWARE_SERVICE)
export class PrepareMiddlewareService implements ICoreService {
  public serviceName = 'PrepareMiddlewareService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container: Container;

  /**
   * @description Prepares middleware instances from middleware classes
   * @param {MiddlewareClass[]} middlewares - Middleware classes to prepare
   * @returns {Promise<BaseMiddleware[]>} Prepared middleware instances
   */
  public async prepare(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    const preparedMiddlewares: BaseMiddleware[] = [];

    for (const middleware of middlewares) {
      // Own-only. Read off the chain, an *undecorated* subclass of a middleware resolves to its
      // base class's name and the base's handler silently runs in its place - a route declaring a
      // stricter guard would serve the request with the weaker one, with no error and, when the
      // class is not exported, no warning either. Component identity is not inherited.
      const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, middleware);

      if (!name) {
        throw new Error(
          `Middleware '${middleware.name}' is not a component. Decorate it with @Middleware(). ` +
            'Extending a decorated middleware is not enough: component identity is not inherited, ' +
            "so without its own decorator this class would resolve to its base class's middleware " +
            'and that handler would run in its place.',
        );
      }

      const instances = await this.container.resolve<AsenaMiddlewareService>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];
      let override: string[];
      let isOverride: boolean;

      for (const instance of normalizedInstances) {
        override = getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, instance);

        isOverride = override ? override.includes('handle') : false;

        preparedMiddlewares.push({
          handle: instance.handle.bind(instance),
          override: isOverride,
        });
      }
    }

    return preparedMiddlewares;
  }
}
