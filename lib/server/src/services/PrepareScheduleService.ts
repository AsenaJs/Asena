import type { Container, ICoreService } from '../../../ioc';
import { ComponentConstants, ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';
import { getTypedMetadata } from '../../../utils';
import type { ServerLogger } from '../../../logger';
import type { CronRunner } from '../../schedule/CronRunner';

/**
 * @description PrepareScheduleService - Discovers and registers scheduled components
 *
 * Scan Process:
 * 1. Resolve all ComponentType.SCHEDULE from container
 * 2. Extract cron metadata from class
 * 3. Validate execute() method exists (AsenaSchedule contract)
 * 4. Register job with CronRunner
 */
@CoreService(ICoreServiceNames.PREPARE_SCHEDULE_SERVICE)
export class PrepareScheduleService implements ICoreService {
  public readonly serviceName = 'PrepareScheduleService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger!: ServerLogger;

  @Inject(ICoreServiceNames.CRON_RUNNER)
  private cronRunner!: CronRunner;

  /**
   * Discover and register all scheduled components with CronRunner
   */
  public async prepare(): Promise<void> {
    const schedules = await this.container.resolveAll<any>(ComponentType.SCHEDULE);

    if (!schedules || schedules.length === 0) {
      return;
    }

    for (const schedule of schedules) {
      this.registerSchedule(schedule);
    }
  }

  private registerSchedule(instance: any): void {
    const cronExpression = getTypedMetadata<string>(ComponentConstants.CronKey, instance.constructor);

    const name =
      getTypedMetadata<string>(ComponentConstants.NameKey, instance.constructor) || instance.constructor.name;

    if (!cronExpression) {
      this.logger.warn(`[Schedule] No cron expression for "${name}", skipping`);

      return;
    }

    // Validate AsenaSchedule contract
    if (typeof instance.execute !== 'function') {
      throw new Error(
        `@Schedule class "${name}" must implement AsenaSchedule interface (missing execute() method)`,
      );
    }

    this.cronRunner.registerJob(name, cronExpression, instance.execute.bind(instance));
  }
}
