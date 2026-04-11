import { ComponentConstants } from '../ioc/constants';
import { ComponentType } from '../ioc/types';
import { getOwnTypedMetadata, getTypedMetadata } from './typedMetadata';
import type { Route } from '../adapter';

/**
 * Extracted route information from a controller instance.
 * Provides a stable public API for reading controller metadata
 * without exposing internal ComponentConstants symbols.
 */
export interface ControllerRouteInfo {
  /** Base path from @Controller decorator (e.g., '/api/users') */
  basePath: string;
  /** Component name from @Controller decorator or class name */
  controllerName: string;
  /** Optional description for the controller (used as OpenAPI tag description) */
  description: string;
  /** Route map: { [methodName]: { path, method, description, validator, ... } } */
  routes: Route;
}

/**
 * Extracts route metadata from a controller instance.
 *
 * @param controller - A resolved controller instance from the container
 * @returns Controller route information including base path, name, and route definitions
 *
 * @example
 * ```typescript
 * const controllers = await container.resolveAll(ComponentType.CONTROLLER);
 * for (const controller of controllers) {
 *   const info = extractControllerRouteInfo(controller);
 *   console.log(info.basePath, info.controllerName, Object.keys(info.routes));
 * }
 * ```
 */
export function extractControllerRouteInfo(controller: any): ControllerRouteInfo {
  const constructor = controller?.constructor;

  return {
    basePath: getOwnTypedMetadata<string>(ComponentConstants.PathKey, constructor) || '',
    controllerName: getTypedMetadata<string>(ComponentConstants.NameKey, constructor) || '',
    description: getOwnTypedMetadata<string>(ComponentConstants.ControllerDescriptionKey, constructor) || '',
    routes: getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, constructor) || {},
  };
}

/**
 * Extracts the registered component name from a class or instance.
 *
 * @param target - A class constructor or instance
 * @returns The component name, or empty string if not found
 *
 * @example
 * ```typescript
 * const name = extractComponentName(MyValidator);
 * const validator = await container.resolve(name);
 * ```
 */
export function extractComponentName(target: any): string {
  const constructor = typeof target === 'function' ? target : target?.constructor;

  return getTypedMetadata<string>(ComponentConstants.NameKey, constructor) || '';
}

// ─── Component Type Query Utilities ───
// Stable public API for @asenajs/* package developers.
// Wraps internal ComponentConstants symbols — safe across versions.

/**
 * Checks if a class is decorated with `@Middleware({ validator: true })`.
 *
 * @param target - A class constructor
 * @returns true if the class is a validator middleware
 *
 * @example
 * ```typescript
 * // In a PostProcessor:
 * postProcess<T>(instance: T, Class: any): T {
 *   if (isValidator(Class)) {
 *     // collect validator instance
 *   }
 *   return instance;
 * }
 * ```
 */
export function isValidator(target: any): boolean {
  return getOwnTypedMetadata<boolean>(ComponentConstants.ValidatorKey, target) === true;
}

/**
 * Checks if a class is decorated with `@Controller`.
 *
 * @param target - A class constructor
 */
export function isController(target: any): boolean {
  return getOwnTypedMetadata<boolean>(ComponentType.CONTROLLER, target) === true;
}

/**
 * Checks if a class is decorated with `@Service`.
 *
 * @param target - A class constructor
 */
export function isService(target: any): boolean {
  return getOwnTypedMetadata<boolean>(ComponentType.SERVICE, target) === true;
}

/**
 * Checks if a class is decorated with `@Middleware`.
 *
 * @param target - A class constructor
 */
export function isMiddleware(target: any): boolean {
  return getOwnTypedMetadata<boolean>(ComponentType.MIDDLEWARE, target) === true;
}

/**
 * Returns the component type string if the class is an Asena component.
 *
 * @param target - A class constructor
 * @returns Component type ('SERVICE', 'CONTROLLER', 'MIDDLEWARE', etc.) or undefined
 */
export function getComponentType(target: any): string | undefined {
  for (const type of Object.values(ComponentType)) {
    if (getOwnTypedMetadata<boolean>(type, target) === true) {
      return type;
    }
  }

  return undefined;
}
