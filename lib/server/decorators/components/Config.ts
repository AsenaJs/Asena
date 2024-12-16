import { type ComponentParams, ComponentType } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';

export const Config = (params: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.CONFIG, params);
};
