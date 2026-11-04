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
   * Run a registered job once, now, through the same path a timed run takes: a failure is logged
   * the same way. Its schedule is left as it is.
   *
   * @param name - The job name, as registered
   * @throws When no job has that name, or with the job's own failure after it is logged
   */
  public async runNow(name: string): Promise<void> {
    const job = this.jobs.find((candidate) => candidate.name === name);

    if (!job) {
      throw new Error(`No @Schedule job named "${name}"`);
    }

    const failure = await this.execute(job);

    if (failure) {
      throw failure.error;
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

    job.timer = setTimeout(() => {
      if (!job.running) return;

      void this.execute(job).then(() => {
        this.scheduleNext(job);
      });
    }, delay);
  }

  /** @returns The failure, already logged, or `undefined` when the job succeeded */
  private async execute(job: ScheduledJob): Promise<{ error: unknown } | undefined> {
    try {
      await job.handler();

      return undefined;
    } catch (error) {
      this.logger.error(`[Schedule] Error in "${job.name}":`, error);

      return { error };
    }
  }
}
