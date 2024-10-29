import { defineMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../constants';

/**
 * A class decorator that adds metadata to the target class.
 *
 * @param {string} implement - The name of the interface to implement.
 * @returns {ClassDecorator} - The class decorator function.
 */
export function Implements(implement: string): ClassDecorator {
  return (target: any) => {
    defineMetadata(ComponentConstants.InterfaceKey, implement, target);
  };
}
