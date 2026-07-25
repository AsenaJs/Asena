import type { ServeOptions } from 'bun';
import type { WSOptions } from '../../server/web/websocket';

/**
 * AsenaServerOptions excludes framework-managed properties from Bun's ServeOptions.
 *
 * Excluded properties (managed internally by AsenaJS):
 * - `fetch`: Managed by HTTP adapter (e.g., HonoAdapter)
 * - `routes`: Managed by AsenaJS routing decorators (@Get, @Post, etc.)
 * - `websocket`: Managed by AsenaWebsocketAdapter
 * - `error`: Managed through AsenaConfig.onError()
 *
 * Available options include:
 * - Network: `hostname`, `port`, `unix`, `reusePort`, `ipv6Only`
 * - Security: `tls`
 * - Performance: `maxRequestBodySize`, `idleTimeout`
 * - Development: `development`, `id`
 */
export type AsenaServerOptions = Omit<ServeOptions, 'fetch' | 'routes' | 'websocket' | 'error'>;

/**
 * Complete configuration for AsenaJS server.
 *
 * @property serveOptions - Bun server options (excluding framework-managed properties)
 * @property wsOptions - AsenaJS WebSocket-specific options
 */
export interface AsenaServeOptions {
  serveOptions?: AsenaServerOptions;
  wsOptions?: WSOptions;
}

/**
 * Options passed to `AsenaAdapter.start()`.
 *
 * Every field is optional and adapters may ignore what they do not support, so adding
 * one stays backwards compatible for third-party adapters.
 */
export interface AsenaStartOptions {
  /**
   * Listen on a unix domain socket instead of a TCP port.
   *
   * Test harnesses use this to exercise the real routing pipeline without occupying a
   * port. Adapters implementing it must not pass `hostname` to `Bun.serve` while it is
   * set - Bun rejects that combination with "Cannot specify both hostname and unix".
   */
  unix?: string;
}
