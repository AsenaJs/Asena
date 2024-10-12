import { defineMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../constants';

export function Implements(implement: string): ClassDecorator {
  return (target: any) => {
    defineMetadata(ComponentConstants.InterfaceKey, implement, target);
  };
}
