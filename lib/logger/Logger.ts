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

  /**
   * Starts or stops a profiling timer for the given id.
   * @param message - The profile id. Call once to start, again to stop and log the elapsed time.
   */
  profile: (message: string) => void;

  /**
   * Logs a debug message.
   *
   * Optional so that existing ServerLogger implementations keep compiling. Callers must
   * fall back when it is absent - see the level selection in the adapters' error handlers.
   *
   * @param message - The message to log.
   * @param meta - Optional metadata to include with the log.
   */
  debug?: (message: string, meta?: any) => void;
}
