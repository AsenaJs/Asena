import type { AsenaContext } from '../../adapter';
import type { ServeOptions, TLSServeOptions, UnixServeOptions, UnixTLSServeOptions } from 'bun';

export interface AsenaConfig<C extends AsenaContext<any, any> = AsenaContext<any, any>> {
  onError?(error: Error, context: C): Response | Promise<Response>;
  serveOptions?(): ServeOptions | TLSServeOptions | UnixServeOptions | UnixTLSServeOptions;
}


export const AsenaConfigFuncions = "onError, serveOptions";