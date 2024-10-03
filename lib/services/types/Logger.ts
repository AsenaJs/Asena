/**
 * Interface for logging messages on the server.
 */
export interface ServerLogger {
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
}
