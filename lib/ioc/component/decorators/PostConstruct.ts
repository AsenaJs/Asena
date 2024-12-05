import { ComponentConstants } from '../../constants';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';

/**
 * A decorator that marks a method to be called after the component's construction.
 *
 * @returns {PropertyDecorator} The property decorator function.
 */
export const PostConstruct = (): PropertyDecorator => {
  return (target: object, propertyKey: string): void => {
    const postConstructs: string[] = getMetadata(ComponentConstants.PostConstructKey, target.constructor) || [];

    if (!postConstructs.includes(propertyKey)) {
      postConstructs.push(propertyKey);
    }
    
    defineMetadata(ComponentConstants.PostConstructKey, postConstructs, target.constructor);
  };
};
