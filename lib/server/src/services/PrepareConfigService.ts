import type { AsenaConfig } from '../../config';
import { ComponentType, type Container, CoreService, type ICoreService, ICoreServiceNames } from '../../../ioc';
import { getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import { type ServerLogger, yellow } from '../../../logger';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing configuration
 * Handles config resolution and validation
 */
@CoreService(ICoreServiceNames.PREPARE_CONFIG_SERVICE)
export class PrepareConfigService implements ICoreService {

  public serviceName = 'PrepareConfigService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container: Container;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger: ServerLogger;

  public async prepare(): Promise<AsenaConfig> {
    const config = await this.container.resolveAll<AsenaConfig>(ComponentType.CONFIG);

    if (!config?.length) {
      this.logger.info('No configs found');
      return;
    }

    if (config.length > 1) {
      throw new Error('Only one config is allowed');
    }

    if (Array.isArray(config[0])) {
      throw new Error('Config cannot be array');
    }

    const configInstance = config[0];

    if (!configInstance) {
      this.logger.info('Config instance not found');
      return;
    }

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, config[0].constructor);

    this.logger.info(`AsenaConfig service found ${yellow(name)}`);

    return configInstance;
  }

}
