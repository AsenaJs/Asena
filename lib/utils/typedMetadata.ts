import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';

export const getTypedMetadata = <T>(key: string, target: any): T | undefined => {
  return getMetadata(key, target);
};

// eslint-disable-next-line max-params
export const defineTypedMetadata = <T>(key: string, value: T, target: any, sym?: string | symbol): void => {
  if (sym === undefined) {
    defineMetadata(key, value, target);
    return;
  }

  defineMetadata(key, value, target, sym);
};