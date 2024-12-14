import { ComponentType } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';

export const Config = (): ClassDecorator => {
  return defineComponent(ComponentType.CONFIG, undefined);
};
