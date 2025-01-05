import type { ServeOptions, TLSServeOptions, UnixServeOptions, UnixTLSServeOptions } from 'bun';
import type { WSOptions } from '../../server/web/websocket';

export type AsenaServerOptions = ServeOptions | TLSServeOptions | UnixServeOptions | UnixTLSServeOptions;

export interface AsenaServeOptions {
  serveOptions?: AsenaServerOptions;
  wsOptions?: WSOptions;
}
