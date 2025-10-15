import { defineTypedMetadata, getOwnTypedMetadata } from '../../utils/typedMetadata';
import { ComponentConstants } from '../constants';
import { Scope } from '../component';
import type { Dependencies, Strategies } from '../types';

export const CORE_SERVICE = Symbol('CORE_SERVICE');

/**
 * @description Decorator for marking core framework services
 * Core services are always singletons and managed by CoreContainer
 * @param {string} name - Optional service name (defaults to class name)
 * @returns {Function} Class decorator
 */
export function CoreService(name?: string) {
  return function (target: any) {
    defineTypedMetadata(CORE_SERVICE, true, target);
    const serviceName = name || target.name;

    defineTypedMetadata(ComponentConstants.NameKey, serviceName, target);
    defineTypedMetadata(ComponentConstants.ScopeKey, Scope.SINGLETON, target);

    // Initialize dependency metadata for injection to work
    if (getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, target) === undefined) {
      defineTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, {}, target);
    }

    // Initialize strategy metadata for injection to work
    if (getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, target) === undefined) {
      defineTypedMetadata<Strategies>(ComponentConstants.StrategyKey, {}, target);
    }
  };
}
