/**
 * Interface for logging messages on the server.
 */
export interface ServerLogger {
  /**
   * Logs an informational message.
   * @param message - The message to log.
   * @param meta - Optional metadata to include with the log.
   */
  info: (message: string, meta?: any) => void;

  /**
   * Logs a warning message.
   * @param message - The message to log.
   * @param meta - Optional metadata to include with the log.
   */
  warn: (message: string, meta?: any) => void;

  /**
   * Logs an error message.
   * @param message - The message to log.
   * @param meta - Optional metadata to include with the log.
   */
  error: (message: string, meta?: any) => void;
}
