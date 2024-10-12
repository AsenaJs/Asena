import type { MiddlewareClass } from '../../types';
import type { Injectable } from '../../../ioc/types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../../ioc/constants';

export const defineMiddleware = (target: Function, middlewares: MiddlewareClass[]): void => {
  const deps: Injectable = getMetadata(ComponentConstants.DependencyKey, target) || {};

  for (const middleware of middlewares) {
    const keys = Object.keys(deps);

    const name = getMetadata(ComponentConstants.NameKey, middleware);

    if (!keys.includes(name)) {
      deps[name] = middleware;
    }
  }

  defineMetadata(ComponentConstants.DependencyKey, deps, target);
};
