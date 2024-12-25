import type { ServeOptions, TLSServeOptions, UnixServeOptions, UnixTLSServeOptions } from 'bun';
import type { WSOptions } from '../../server/web/websocket';

export type AsenaServeOptions = (ServeOptions | TLSServeOptions | UnixServeOptions | UnixTLSServeOptions) & {
  wsOptions: WSOptions;
};
