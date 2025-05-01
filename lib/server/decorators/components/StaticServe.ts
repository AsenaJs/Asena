import { defineTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';


export const StaticServe = (): PropertyDecorator => {
  return (target: object, propertyKey: string) => {
    const staticServes: string[] = getTypedMetadata<string[]>(ComponentConstants.StaticServeKey, target) || [];

    if (!staticServes.includes(propertyKey)) {
      staticServes.push(propertyKey);
    }

    defineTypedMetadata<string[]>(ComponentConstants.StaticServeKey, staticServes, target);
  };
};
