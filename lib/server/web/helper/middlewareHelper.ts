import type { MiddlewareClass } from '../../types';
import type { Injectable } from '../../../ioc/types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../../ioc/constants';

/**
 * Defines middlewares for target class.
 *
 * @param {Function} target - The target class to which the middleware will be applied.
 * @param {MiddlewareClass[]} middlewares - An array of middleware classes to be defined.
 */
export const defineMiddleware = (target: Function, middlewares: MiddlewareClass[]): void => {
  const deps: Injectable = getMetadata(ComponentConstants.SoftDependencyKey, target) || {};

  for (const middleware of middlewares) {
    const keys = Object.keys(deps);

    const name = getMetadata(ComponentConstants.NameKey, middleware);

    if (!keys.includes(name)) {
      deps[name] = middleware;
    }
  }

  defineMetadata(ComponentConstants.SoftDependencyKey, deps, target);
};
