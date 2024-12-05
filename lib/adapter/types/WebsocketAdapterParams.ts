import type { ServerLogger } from '../../logger';

export interface WebsocketAdapterParams<A> {
  /**
   * An optional logger instance for logging purposes.
   */
  logger?: ServerLogger;

  /**
   * The application instance.
   */
  app?: A;
}
