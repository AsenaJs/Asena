import type { ComponentParams, ComponentType, ServiceParams } from '../types';
import { Scope } from '../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';

import { DependencyKey, IOCObjectKey, NameKey, ScopeKey, StrategyKey } from '../constants';

export const defineComponent = <T extends ComponentParams>(
  componentType: ComponentType,
  params: T | string,
  extra?: (target: Function) => void,
): ClassDecorator => {
  return (target: Function) => {
    const { scope = Scope.SINGLETON, name = target.name } = paramsGenerator(params);

    defineMetadata(componentType, true, target);

    defineMetadata(IOCObjectKey, true, target);

    defineMetadata(ScopeKey, scope, target);

    defineMetadata(NameKey, name, target);

    if (extra) {
      extra(target);
    }

    if (getMetadata(DependencyKey, target) === undefined) {
      defineMetadata(DependencyKey, {}, target);
    }

    if (getMetadata(StrategyKey, target) === undefined) {
      defineMetadata(StrategyKey, {}, target);
    }
  };
};

const paramsGenerator = (params: ComponentParams | string): ComponentParams | ServiceParams => {
  return typeof params === 'string' ? { name: params } : params;
};
