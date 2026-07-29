/**
 * @description Where the server is in its start/stop cycle.
 *
 * Deliberately separate from `CoreBootstrapPhase`, which describes how the container was wired
 * and only ever moves forwards. This is runtime state: it goes back and forth, a readiness
 * probe reads it, and `stop()` uses it to decide what may be torn down.
 */
export enum LifecycleState {
  /** Constructed, `start()` not called yet. */
  NEW = 'NEW',
  /** Inside `start()` - start hooks are running. */
  STARTING = 'STARTING',
  /** Every start hook completed; the server is serving. */
  STARTED = 'STARTED',
  /** Inside `stop()` - already draining, so no longer ready for traffic. */
  STOPPING = 'STOPPING',
  /** Stopped. Stop hooks have run for everything that started. */
  STOPPED = 'STOPPED',
  /** A start hook threw. Whatever had started was rolled back. */
  FAILED = 'FAILED',
}
