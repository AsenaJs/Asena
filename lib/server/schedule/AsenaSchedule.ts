/**
 * Contract interface for scheduled task classes.
 * Classes decorated with @Schedule must implement this interface.
 *
 * @example
 * ```typescript
 * @Schedule({ cron: '0 9 * * MON-FRI' })
 * class MyTask implements AsenaSchedule {
 *   async execute() {
 *     // Runs at 9:00 AM on weekdays
 *   }
 * }
 * ```
 */
export interface AsenaSchedule {
  /**
   * Called on each scheduled execution.
   * Can be async - errors are caught and logged without stopping the schedule.
   */
  execute(): Promise<void> | void;
}
