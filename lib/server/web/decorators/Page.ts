import { ComponentConstants } from '../../../ioc';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils/typedMetadata';

export interface PageRoute {
  [key: string]: { path: string };
}

/**
 * Method decorator for defining a page route in a FrontendController.
 * The decorated method should return a Bun HTMLBundle (imported from .html file).
 *
 * @param {string} path - The sub-path for this page (relative to FrontendController base path)
 * @returns {MethodDecorator}
 */
export function Page(path: string) {
  return function (target: object, propertyKey: string, _descriptor: PropertyDescriptor) {
    const routes = getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, target.constructor) || {};

    routes[propertyKey] = { path: path.replace(/^\/+/, '') };

    defineTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, routes, target.constructor);
  };
}