import type { ComponentParams , ComponentType} from '../types';
import { Scope } from '../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';

import { DependencyKey, IOCObjectKey, NameKey, ScopeKey, StrategyKey } from '../constants';

export const defineComponent = <T extends ComponentParams>(
  componentType: ComponentType,
  params: T,
  extra?: (target: Function) => void,
): ClassDecorator => {
  return (target: Function) => {
    const scope = params.scope || Scope.SINGLETON;
    const name = params.name || target.name;

    defineMetadata(componentType, true, target);

    defineMetadata(IOCObjectKey, true, target);

    defineMetadata(ScopeKey, scope, target);

    defineMetadata(NameKey, name, target);

    if (getMetadata(DependencyKey, target) === undefined) {
      defineMetadata(DependencyKey, {}, target);
    }

    if (getMetadata(StrategyKey, target) === undefined) {
      defineMetadata(StrategyKey, {}, target);
    }

    if (extra) {
      extra(target);
    }
  };
};
