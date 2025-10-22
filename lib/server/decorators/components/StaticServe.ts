import { defineTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { StaticServeParams } from '../../web/middleware';
import { defineComponent } from '../../../ioc/component';
import { ComponentType } from '../../../ioc/types';

/**
 * Decorator for registering static file serving middleware in Asena controllers.
 * Sets the root directory path for serving static files.
 *
 * @param {string | StaticServeParams} name - The root directory path or configuration parameters
 * @returns {ClassDecorator} A class decorator function
 *
 * @example
 * ```typescript
 * @StaticServe("TestStaticMiddleware")
 * export class StaticMiddleware extends StaticServeService {
 *   // ...implementation
 * }
 * ```
 */
export const StaticServe = (name?: string | StaticServeParams): ClassDecorator => {
  return defineComponent(ComponentType.MIDDLEWARE, name, (target) => {
    if (typeof name !== 'string' && name?.root) {
      defineTypedMetadata<string>(ComponentConstants.StaticServeRootKey, name.root, target);
    }
  });
};
