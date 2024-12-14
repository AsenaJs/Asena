import type { ComponentParams, ComponentType, Dependencies, ServiceParams, Strategies } from '../types';
import { Scope } from '../types';
import { ComponentConstants } from '../constants';
import { defineTypedMetadata, getTypedMetadata } from '../../utils/typedMetadata';

export const defineComponent = <T extends ComponentParams>(
  componentType: ComponentType,
  params: T | string,
  extra?: (target: Function) => void,
): ClassDecorator => {
  return (target: Function) => {
    const { scope = Scope.SINGLETON, name = target.name } = paramsGenerator(params);

    defineTypedMetadata<boolean>(componentType, true, target);

    defineTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, true, target);

    defineTypedMetadata<Scope>(ComponentConstants.ScopeKey, scope, target);

    defineTypedMetadata<string>(ComponentConstants.NameKey, name, target);

    if (extra) {
      extra(target);
    }

    if (getTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, target) === undefined) {
      defineTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, {}, target);
    }

    if (getTypedMetadata<Strategies>(ComponentConstants.StrategyKey, target) === undefined) {
      defineTypedMetadata<Strategies>(ComponentConstants.StrategyKey, {}, target);
    }
  };
};

// Todo if websocket or controller name in container will set as path this is not good. We need to change this.
const paramsGenerator = (params: ComponentParams | string): ComponentParams | ServiceParams => {
  const defaultParam: ComponentParams | ServiceParams = { name: undefined, scope: undefined };

  return typeof params === 'string' ? { name: params } : params || defaultParam;
};
