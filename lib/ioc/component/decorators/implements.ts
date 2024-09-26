import { defineMetadata } from 'reflect-metadata/no-conflict';
import { InterfaceKey } from '../../constants';

export function Implements(implement: string): ClassDecorator {
  return (target: any) => {
    defineMetadata(InterfaceKey, implement, target);
  };
}
