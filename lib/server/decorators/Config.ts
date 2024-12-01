import { defineMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../ioc/constants';

export const Config = (): ClassDecorator => {
  return (target: Function) => {
    defineMetadata(ComponentConstants.ConfigKey, true, target);
  };
};
