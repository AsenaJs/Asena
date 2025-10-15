import { defineMetadata, getMetadata, getOwnMetadata } from 'reflect-metadata/no-conflict';

export const getTypedMetadata = <T>(key: string | symbol, target: any): T | undefined => {
  return getMetadata(key, target);
};

export const getOwnTypedMetadata = <T>(key: string | symbol, target: any): T | undefined => {
  return getOwnMetadata(key, target);
};

// eslint-disable-next-line max-params
export const defineTypedMetadata = <T>(key: string | symbol, value: T, target: any, sym?: string | symbol): void => {
  if (sym === undefined) {
    defineMetadata(key, value, target);
    return;
  }

  defineMetadata(key, value, target, sym);
};
