import { getOwnTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { AsenaStaticServeService, StaticServeClass } from '../../web/middleware';
import type { BaseStaticServeParams } from '../../../adapter';
import { type Container, CoreService, type ICoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing static serve configuration
 * Handles static serve service resolution and configuration
 */
@CoreService(ICoreServiceNames.PREPARE_STATIC_SERVE_CONFIG_SERVICE)
export class PrepareStaticServeConfigService implements ICoreService {

  public serviceName = 'PrepareStaticServeConfigService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container: Container;

  public async prepare(staticServeClass: StaticServeClass): Promise<BaseStaticServeParams> {
    if (!staticServeClass) {
      return;
    }

    const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, staticServeClass);
    const root = getOwnTypedMetadata<string>(ComponentConstants.StaticServeRootKey, staticServeClass);

    const staticServeServiceInstance: AsenaStaticServeService<any>[] | AsenaStaticServeService<any> =
      await this.container.resolve<AsenaStaticServeService<any>>(name);

    if (!staticServeServiceInstance) {
      throw new Error(`Static Serve service ${name} not found.`);
    }

    if (Array.isArray(staticServeServiceInstance)) {
      throw new Error('Static serve service cannot be array');
    }

    const overrides: string[] = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, staticServeServiceInstance);

    const baseStaticServeParams: BaseStaticServeParams = {
      extra: undefined,
      root,
      rewriteRequestPath: undefined,
      onFound: undefined,
      onNotFound: undefined,
    };

    if (staticServeServiceInstance.extra) {
      baseStaticServeParams.extra = staticServeServiceInstance.extra;
    }

    if (staticServeServiceInstance.rewriteRequestPath) {
      baseStaticServeParams.rewriteRequestPath = staticServeServiceInstance.rewriteRequestPath;
    }

    if (staticServeServiceInstance.onFound) {
      baseStaticServeParams.onFound = {
        handler: staticServeServiceInstance.onFound.bind(staticServeServiceInstance),
        override: overrides?.includes('onFound'),
      };
    }

    if (staticServeServiceInstance.onNotFound) {
      baseStaticServeParams.onNotFound = {
        handler: staticServeServiceInstance.onNotFound.bind(staticServeServiceInstance),
        override: overrides?.includes('onNotFound'),
      };
    }

    return baseStaticServeParams;
  }

}
