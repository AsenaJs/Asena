import { PrepareService } from '../PrepareService';
import { getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { AsenaStaticServeService, StaticServeClass } from '../../web/middleware';
import type { BaseStaticServeParams } from '../../../adapter';
import type { Container } from '../../../ioc';
import type { ServerLogger } from '../../../logger';

export class PrepareStaticServeConfigService extends PrepareService {

  public constructor(container: Container, logger: ServerLogger) {
    super(container, logger);
  }

  public async prepare(staticServeClass: StaticServeClass): Promise<BaseStaticServeParams> {
    if (!staticServeClass) {
      return;
    }

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, staticServeClass);
    const root = getTypedMetadata<string>(ComponentConstants.StaticServeRootKey, staticServeClass);

    const staticServeService: AsenaStaticServeService<any>[] | AsenaStaticServeService<any> =
      await this.container.resolve<AsenaStaticServeService<any>>(name);

    if (!staticServeService) {
      throw new Error(`Static Serve service ${name} not found.`);
    }

    if (Array.isArray(staticServeService)) {
      throw new Error('Static serve service cannot be array');
    }

    const overrides: string[] = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, staticServeService);

    const baseStaticServeParams: BaseStaticServeParams = {
      extra: undefined,
      root,
      rewriteRequestPath: undefined,
      onFound: undefined,
      onNotFound: undefined,
    };

    if (staticServeService.extra) {
      baseStaticServeParams.extra = staticServeService.extra;
    }

    if (staticServeService.rewriteRequestPath) {
      baseStaticServeParams.rewriteRequestPath = staticServeService.rewriteRequestPath;
    }

    if (staticServeService.onFound) {
      baseStaticServeParams.onFound = {
        handler: staticServeService.onFound.bind(staticServeService),
        override: overrides?.includes('onFound'),
      };
    }

    if (staticServeService.onNotFound) {
      baseStaticServeParams.onNotFound = {
        handler: staticServeService.onNotFound.bind(staticServeService),
        override: overrides?.includes('onNotFound'),
      };
    }

    return baseStaticServeParams;
  }

}
