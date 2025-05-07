import { PrepareService } from '../PrepareService';
import type { AsenaMiddlewareService, MiddlewareClass } from '../../web/middleware';
import type { BaseMiddleware } from '../../../adapter';
import { getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { ServerLogger } from '../../../logger';
import type { Container } from '../../../ioc';

export class PrepareMiddlewareService extends PrepareService {

  public constructor(container: Container, logger: ServerLogger) {
    super(container, logger);
  }

  /**
   * @description Prepares middleware instances from middleware classes
   * @param {MiddlewareClass[]} middlewares - Middleware classes to prepare
   * @returns {Promise<BaseMiddleware[]>} Prepared middleware instances
   */
  public async prepare(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    const preparedMiddlewares: BaseMiddleware[] = [];

    for (const middleware of middlewares) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, middleware);
      const override = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, middleware);
      const isOverride = override ? override.includes('handle') : false;

      const instances = await this.container.resolve<AsenaMiddlewareService>(name);

      if (!instances) continue;

      const normalizedInstances = Array.isArray(instances) ? instances : [instances];

      for (const instance of normalizedInstances) {
        preparedMiddlewares.push({
          handle: instance.handle.bind(instance),
          override: isOverride,
        });
      }
    }

    return preparedMiddlewares;
  }

}
