/**
 * @description How the server should react to the process being asked to go away.
 *
 * Signal handling is on by default. Every deployment that rolls a pod needs the same four
 * lines, getting them slightly wrong is invisible until the next deploy, and a framework that
 * already owns `start()` and `stop()` is the right place for it. Listeners are installed in
 * `start()` and removed in `stop()`, so a process that boots several servers - a test suite -
 * does not accumulate them.
 */
export interface ShutdownOptions {
  /**
   * Install process signal handlers that call `stop()`.
   *
   * `true` (default) covers SIGTERM, SIGINT and SIGHUP. Pass an explicit list to narrow it, or
   * `false` to own the signals yourself.
   *
   * @default true
   */
  signals?: boolean | NodeJS.Signals[];

  /**
   * Per-hook ceiling for `@OnStop`, in milliseconds.
   *
   * @default 5000
   */
  timeout?: number;

  /**
   * Force the process to exit if it is still alive this many milliseconds after a
   * signal-triggered shutdown began.
   *
   * The escape hatch for a handle nothing owns up to - an undisposed timer, a socket that will
   * not close. Note the deadline is on the *process*, not on `stop()`: the case that actually
   * strands a pod is a shutdown that completed cleanly and left something ref'd behind anyway.
   * The timer is unref'd, so a process that exits on its own never waits for it.
   *
   * `false` leaves the process to exit on its own once the event loop empties, which is the
   * honest default: a process that will not exit is a bug worth seeing rather than papering
   * over. Exits non-zero, because a forced exit is not a clean one.
   *
   * @default false
   */
  forceExitAfter?: number | false;

  /**
   * Treat an uncaught exception or unhandled rejection as a shutdown request: log it, run the
   * stop sequence, then exit non-zero.
   *
   * Off by default. It turns a crash into a graceful teardown, which is usually what a
   * production process wants - but it also swallows the stack Bun would otherwise print at the
   * top level, so it is opt-in.
   *
   * @default false
   */
  onUnhandledError?: boolean;
}

/**
 * @description Options for `AsenaServer.stop()`.
 *
 * `stop()` used to take a bare boolean, which left nowhere to put the drain timeout the
 * microservice transports already supported - so an application could not reach it at all.
 * The boolean is still accepted.
 */
export interface AsenaStopOptions {
  /**
   * Close in-flight connections instead of waiting for them.
   *
   * @default true
   */
  closeActiveConnections?: boolean;

  /**
   * How long microservice transports may drain in-flight messages, in milliseconds.
   * Passed through to each transport's `destroy()`.
   */
  drainTimeout?: number;

  /**
   * Per-hook ceiling for `@OnStop`, in milliseconds. Overrides `shutdown.timeout`.
   */
  hookTimeout?: number;
}
