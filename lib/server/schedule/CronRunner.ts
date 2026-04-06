import { CoreService, ICoreServiceNames } from '../../ioc';
import type { ICoreService } from '../../ioc';
import { Inject } from '../../ioc/component';
import type { ServerLogger } from '../../logger';

interface ScheduledJob {
  name: string;
  cronExpression: string;
  handler: () => Promise<void> | void;
  timer: Timer | null;
  running: boolean;
}

/**
 * @description CronRunner - Core service for managing scheduled job execution.
 * Uses Bun.cron.parse() for next-run calculation + setTimeout for timing.
 *
 * Design:
 * - Lazy: zero cost until startAll() is called
 * - Error-resilient: handler errors are logged but don't stop the schedule
 * - Idempotent: multiple startAll() calls have no effect
 *
 * @internal Managed by PrepareScheduleService, not used directly by users
 */
@CoreService(ICoreServiceNames.CRON_RUNNER)
export class CronRunner implements ICoreService {
  public readonly serviceName = 'CronRunner';

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger!: ServerLogger;

  private jobs: ScheduledJob[] = [];

  /**
   * Register a new scheduled job.
   * Job won't start until startAll() is called.
   *
   * @param name - Job identifier for logging
   * @param cronExpression - 5-field cron expression or nickname (@daily, @hourly, etc.)
   * @param handler - Function to execute on schedule
   */
  public registerJob(name: string, cronExpression: string, handler: () => Promise<void> | void): void {
    this.jobs.push({
      name,
      cronExpression,
      handler,
      timer: null,
      running: false,
    });
  }

  /**
   * Start all registered jobs.
   * Idempotent - already running jobs are skipped.
   */
  public startAll(): void {
    for (const job of this.jobs) {
      if (job.running) continue;

      job.running = true;
      this.scheduleNext(job);
      this.logger.info(`[Schedule] Started "${job.name}"`);
    }
  }

  /**
   * Stop all running jobs and clear timers.
   */
  public stopAll(): void {
    for (const job of this.jobs) {
      this.stopJob(job);
    }
  }

  /**
   * Get registered job count (for testing/debugging)
   */
  public get jobCount(): number {
    return this.jobs.length;
  }

  /**
   * Get all job names (for testing/debugging)
   */
  public getJobNames(): string[] {
    return this.jobs.map((j) => j.name);
  }

  /**
   * Check if any job is currently running
   */
  public get hasRunningJobs(): boolean {
    return this.jobs.some((j) => j.running);
  }

  /**
   * Clear all jobs (for testing)
   * @internal
   */
  public clearJobs(): void {
    this.stopAll();
    this.jobs = [];
  }

  private stopJob(job: ScheduledJob): void {
    job.running = false;

    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }
  }

  private scheduleNext(job: ScheduledJob): void {
    if (!job.running) return;

    const now = Date.now();
    const nextRun = Bun.cron.parse(job.cronExpression, now);

    if (!nextRun) {
      this.logger.warn(`[Schedule] No next run found for "${job.name}", stopping`);
      job.running = false;

      return;
    }

    const delay = nextRun.getTime() - now;

    job.timer = setTimeout(async () => {
      if (!job.running) return;

      try {
        await job.handler();
      } catch (error) {
        this.logger.error(`[Schedule] Error in "${job.name}":`, error);
      }

      this.scheduleNext(job);
    }, delay);
  }
}