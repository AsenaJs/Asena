import type { AsenaContext } from '../../adapter';
import type { AsenaServeOptions } from '../../adapter/types/ServeOptions';

export interface AsenaConfig<C extends AsenaContext<any, any> = AsenaContext<any, any>> {
  onError?(error: Error, context: C): Response | Promise<Response>;
  serveOptions?(): AsenaServeOptions;
}

export const AsenaConfigFunctions = 'onError, serveOptions';
