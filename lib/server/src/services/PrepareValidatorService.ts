import { getChainedTypedMetadataList, getOwnTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { AsenaValidationService, ValidatorClass } from '../../web/middleware';
import { type BaseValidator, VALIDATOR_METHODS, type ValidatorHandler } from '../../../adapter';
import { type Container, CoreService, type ICoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing validator instances
 * Handles validator resolution and method binding
 */
@CoreService(ICoreServiceNames.PREPARE_VALIDATOR_SERVICE)
export class PrepareValidatorService implements ICoreService {
  public serviceName = 'PrepareValidatorService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container: Container;

  public async prepare(Validator: ValidatorClass<any>): Promise<BaseValidator> {
    if (!Validator) {
      return;
    }

    // Own-only - see the note in PrepareMiddlewareService. An undecorated subclass of a validator
    // resolved to its base class's name, so a route declaring a stricter validator was validated
    // by the permissive base one instead.
    const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, Validator);

    if (!name) {
      throw new Error(
        `Validator '${Validator.name}' is not a component. Decorate it with ` +
          '@Middleware({ validator: true }). ' +
          'Extending a decorated validator is not enough: component identity is not inherited, ' +
          "so without its own decorator this class would resolve to its base class's validator " +
          'and that one would run in its place.',
      );
    }

    const validator = await this.container.resolve<AsenaValidationService<any>>(name);

    if (!validator) {
      throw new Error('Validator not found:' + name);
    }

    if (Array.isArray(validator)) {
      throw new Error('Validator cannot be array');
    }

    const overrides: string[] = getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, validator);

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
