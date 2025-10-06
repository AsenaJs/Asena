import type { AsenaMiddlewareService, MiddlewareClass } from '../../web/middleware';
import type { BaseMiddleware } from '../../../adapter';
import { getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { Container, ICoreService } from '../../../ioc';
import { CoreService } from '../../../ioc';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing middleware instances
 * Handles middleware resolution and preparation for routing
 */
@CoreService('PrepareMiddlewareService')
export class PrepareMiddlewareService implements ICoreService {

  public serviceName = 'PrepareMiddlewareService';

  @Inject('Container')
  private container: Container;

  /**
   * @description Prepares middleware instances from middleware classes
   * @param {MiddlewareClass[]} middlewares - Middleware classes to prepare
   * @returns {Promise<BaseMiddleware[]>} Prepared middleware instances
   */
  public async prepare(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    const preparedMiddlewares: BaseMiddleware[] = [];

    for (const middleware of middlewares) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, middleware);

      const instances = await this.container.resolve<AsenaMiddlewareService>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];
      let override: string[];
      let isOverride: boolean;

      for (const instance of normalizedInstances) {
        override = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, instance);

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
