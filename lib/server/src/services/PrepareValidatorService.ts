import { PrepareService } from '../PrepareService';
import { getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { AsenaValidationService, ValidatorClass } from '../../web/middleware';
import { type BaseValidator, VALIDATOR_METHODS, type ValidatorHandler } from '../../../adapter';
import type { Container } from '../../../ioc';
import type { ServerLogger } from '../../../logger';

export class PrepareValidatorService extends PrepareService {

  public constructor(container: Container, logger: ServerLogger) {
    super(container, logger);
  }

  public async prepare(Validator: ValidatorClass<any>): Promise<BaseValidator> {
    if (!Validator) {
      return;
    }

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, Validator);

    const validator = await this.container.resolve<AsenaValidationService<any>>(name);

    if (!validator) {
      throw new Error('Validator not found:' + name);
    }

    if (Array.isArray(validator)) {
      throw new Error('Validator cannot be array');
    }

    const overrides: string[] = getTypedMetadata<string[]>(ComponentConstants.OverrideKey, validator);

    const baseValidatorMiddleware: BaseValidator = {};

    VALIDATOR_METHODS.filter((key) => typeof validator[key] === 'function').forEach((key) => {
      baseValidatorMiddleware[key] = {
        handle: validator[key].bind(validator),
        override: overrides?.includes(key) || false,
      } satisfies ValidatorHandler;
    });

    return baseValidatorMiddleware;
  }

}
