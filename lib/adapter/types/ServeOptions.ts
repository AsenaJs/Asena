import type { ServeOptions } from 'bun';
import type { WSOptions } from '../../server/web/websocket';

export type AsenaServerOptions = ServeOptions;

export interface AsenaServeOptions {
  serveOptions?: AsenaServerOptions;
  wsOptions?: WSOptions;
}
