import type { ComponentParams, ComponentType, ServiceParams } from '../types';
import { Scope } from '../types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import {ComponentConstants} from "../constants";


export const defineComponent = <T extends ComponentParams>(
  componentType: ComponentType,
  params: T | string,
  extra?: (target: Function) => void,
): ClassDecorator => {
  return (target: Function) => {
    const { scope = Scope.SINGLETON, name = target.name } = paramsGenerator(params);

    defineMetadata(componentType, true, target);

    defineMetadata(ComponentConstants.IOCObjectKey, true, target);

    defineMetadata(ComponentConstants.ScopeKey, scope, target);

    defineMetadata(ComponentConstants.NameKey, name, target);

    if (extra) {
      extra(target);
    }

    if (getMetadata(ComponentConstants.DependencyKey, target) === undefined) {
      defineMetadata(ComponentConstants.DependencyKey, {}, target);
    }

    if (getMetadata(ComponentConstants.StrategyKey, target) === undefined) {
      defineMetadata(ComponentConstants.StrategyKey, {}, target);
    }
  };
};

const paramsGenerator = (params: ComponentParams | string): ComponentParams | ServiceParams => {
  const defaultParam: ComponentParams | ServiceParams = { name: undefined, scope: undefined };

  return typeof params === 'string' ? { name: params } : params || defaultParam;
};
