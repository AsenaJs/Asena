import { type ComponentParams, ComponentType, type Dependencies, type Strategies } from '../types';
import { ComponentConstants } from '../constants';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../utils/typedMetadata';
import { Scope } from './Scope';

export const defineComponent = <T extends ComponentParams>(
  componentType: ComponentType,
  params: T | string,
  extra?: (target: Function) => void,
): ClassDecorator => {
  return (target: Function) => {
    const { scope = Scope.SINGLETON, name = target.name } = paramsGenerator(params, componentType);

    defineTypedMetadata<boolean>(componentType, true, target);

    defineTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, true, target);

    defineTypedMetadata<Scope>(ComponentConstants.ScopeKey, scope, target);

    defineTypedMetadata<string>(ComponentConstants.NameKey, name, target);

    if (extra) {
      extra(target);
    }

    if (getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, target) === undefined) {
      defineTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, {}, target);
    }

    if (getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, target) === undefined) {
      defineTypedMetadata<Strategies>(ComponentConstants.StrategyKey, {}, target);
    }
  };
};

const paramsGenerator = (params: ComponentParams | string, componentType: ComponentType): ComponentParams => {
  const defaultParam: ComponentParams = { name: undefined, scope: undefined };

  if (
    typeof params === 'string' &&
    (componentType === ComponentType.CONTROLLER || componentType === ComponentType.WEBSOCKET)
  ) {
    return defaultParam;
  }

  return typeof params === 'string' ? { name: params } : params || defaultParam;
};
