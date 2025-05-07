import { PrepareService } from '../PrepareService';
import type { AsenaConfig } from '../../config';
import { ComponentType } from '../../../ioc/types';
import { getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import { type ServerLogger, yellow } from '../../../logger';
import type { Container } from '../../../ioc';

export class PrepareConfigService extends PrepareService {

  public constructor(container: Container, logger: ServerLogger) {
    super(container, logger);
  }

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

    this.logger.info(`Config found ${yellow(name)}`);

    return configInstance;
  }

}
