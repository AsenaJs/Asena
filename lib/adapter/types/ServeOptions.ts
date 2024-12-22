import type { ServeOptions, TLSServeOptions, UnixServeOptions, UnixTLSServeOptions } from 'bun';

export type AsenaServeOptions = ServeOptions | TLSServeOptions | UnixServeOptions | UnixTLSServeOptions;
