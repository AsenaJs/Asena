import { ComponentConstants } from '../../constants';
import { defineTypedMetadata, getTypedMetadata } from '../../../utils/typedMetadata';

/**
 * A decorator that marks a method to be called after the component's construction.
 *
 * @returns {PropertyDecorator} The property decorator function.
 */
export const PostConstruct = (): PropertyDecorator => {
  return (target: object, propertyKey: string): void => {
    const postConstructs: string[] =
      getTypedMetadata<string[]>(ComponentConstants.PostConstructKey, target.constructor) || [];

    if (!postConstructs.includes(propertyKey)) {
      postConstructs.push(propertyKey);
    }

    defineTypedMetadata<string[]>(ComponentConstants.PostConstructKey, postConstructs, target.constructor);
  };
};
