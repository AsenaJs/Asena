import type { ServerLogger } from '../../logger';

/**
 * A ServerLogger that discards everything.
 *
 * The default logger for test apps: booting a server prints the banner, the adapter name,
 * a route table and a "server running" line, none of which belong in test output.
 *
 * @example
 * ```typescript
 * const [adapter] = createHonoAdapter({ logger: silentLogger });
 * ```
 */
const noop = (): void => {
  // Intentionally empty - the whole point is to keep test output clean
};

export const silentLogger: ServerLogger = {
  info: noop,
  warn: noop,
  error: noop,
  profile: noop,
};

/**
 * A single captured log line.
 */
export interface CapturedLogEntry {
  level: 'info' | 'warn' | 'error' | 'profile';
  message: string;
  meta?: any;
}

/**
 * Creates a silent logger that also records every call, so tests can assert on warnings.
 *
 * @returns The logger plus the array it appends to (live, not a copy)
 *
 * @example
 * ```typescript
 * const { logger, entries } = createCapturingLogger();
 * const { app } = await createWebTest({ adapter, controllers: [UserController], logger });
 *
 * expect(entries.some((e) => e.level === 'warn' && e.message.includes('cannot be auto-mocked'))).toBe(true);
 * ```
 */
export function createCapturingLogger(): { logger: ServerLogger; entries: CapturedLogEntry[] } {
  const entries: CapturedLogEntry[] = [];

  return {
    entries,
    logger: {
      info: (message: string, meta?: any) => {
        entries.push({ level: 'info', message, meta });
      },
      warn: (message: string, meta?: any) => {
        entries.push({ level: 'warn', message, meta });
      },
      error: (message: string, meta?: any) => {
        entries.push({ level: 'error', message, meta });
      },
      profile: (message: string) => {
        entries.push({ level: 'profile', message });
      },
    },
  };
}
