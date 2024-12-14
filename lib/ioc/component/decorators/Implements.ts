import { ComponentConstants } from '../../constants';
import { defineTypedMetadata } from '../../../utils/typedMetadata';

/**
 * A class decorator that adds metadata to the target class.
 *
 * @param {string} implement - The name of the interface to implement.
 * @returns {ClassDecorator} - The class decorator function.
 */
export function Implements(implement: string): ClassDecorator {
  return (target: any) => {
    defineTypedMetadata<string>(ComponentConstants.InterfaceKey, implement, target);
  };
}
