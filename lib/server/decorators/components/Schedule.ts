import { ComponentConstants, ComponentType, type ScheduleParams } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';
import { defineTypedMetadata } from '../../../utils/typedMetadata';

/**
 * Decorator for scheduled task classes.
 * Classes must implement AsenaSchedule interface (execute() method).
 *
 * Uses Bun.cron.parse() for cron expression validation at decoration time.
 *
 * @param params - Schedule parameters including cron expression
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
export const Schedule = (params: ScheduleParams): ClassDecorator => {
  return defineComponent(ComponentType.SCHEDULE, params, (target) => {
    // Validate cron expression using Bun native API
    const nextRun = Bun.cron.parse(params.cron);

    if (nextRun === null) {
      throw new Error(
        `Invalid cron expression "${params.cron}" in @Schedule for ${target.name}. ` +
          `Use 5-field format (minute hour day-of-month month day-of-week) ` +
          `or nicknames (@daily, @hourly, etc.)`,
      );
    }

    // Store cron expression as metadata
    defineTypedMetadata<string>(ComponentConstants.CronKey, params.cron, target);
  });
};
