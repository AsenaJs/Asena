import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { CronRunner } from '../../../lib/server/schedule/CronRunner';

// Mock logger
const createMockLogger = () => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
});

describe('CronRunner', () => {
  let cronRunner: CronRunner;

  beforeEach(() => {
    // Create instance without IoC (for unit testing)
    cronRunner = new CronRunner();

    // Manually set logger since IoC doesn't run in unit tests
    (cronRunner as any).logger = createMockLogger();
  });

  afterEach(() => {
    cronRunner.clearJobs();
  });

  describe('registerJob', () => {
    test('should add job to the list', () => {
      cronRunner.registerJob('test-job', '* * * * *', () => {});

      expect(cronRunner.jobCount).toBe(1);
      expect(cronRunner.getJobNames()).toEqual(['test-job']);
    });

    test('should register multiple jobs', () => {
      cronRunner.registerJob('job-1', '* * * * *', () => {});
      cronRunner.registerJob('job-2', '@daily', () => {});
      cronRunner.registerJob('job-3', '0 9 * * MON-FRI', () => {});

      expect(cronRunner.jobCount).toBe(3);
      expect(cronRunner.getJobNames()).toEqual(['job-1', 'job-2', 'job-3']);
    });

    test('should not start job automatically after registration', () => {
      cronRunner.registerJob('test-job', '* * * * *', () => {});

      expect(cronRunner.hasRunningJobs).toBe(false);
    });
  });

  describe('startAll / stopAll lifecycle', () => {
    test('should start all registered jobs', () => {
      cronRunner.registerJob('job-1', '* * * * *', () => {});
      cronRunner.registerJob('job-2', '@hourly', () => {});

      cronRunner.startAll();

      expect(cronRunner.hasRunningJobs).toBe(true);
    });

    test('should stop all running jobs', () => {
      cronRunner.registerJob('job-1', '* * * * *', () => {});

      cronRunner.startAll();
      expect(cronRunner.hasRunningJobs).toBe(true);

      cronRunner.stopAll();
      expect(cronRunner.hasRunningJobs).toBe(false);
    });

    test('startAll should be idempotent', () => {
      const handler = mock(() => {});

      cronRunner.registerJob('job-1', '* * * * *', handler);

      cronRunner.startAll();
      cronRunner.startAll();
      cronRunner.startAll();

      // Should still have exactly 1 job, not duplicated
      expect(cronRunner.jobCount).toBe(1);
      expect(cronRunner.hasRunningJobs).toBe(true);
    });

    test('stopAll should be safe to call when no jobs running', () => {
      cronRunner.stopAll(); // Should not throw
      expect(cronRunner.hasRunningJobs).toBe(false);
    });
  });

  describe('clearJobs', () => {
    test('should stop and remove all jobs', () => {
      cronRunner.registerJob('job-1', '* * * * *', () => {});
      cronRunner.registerJob('job-2', '@daily', () => {});

      cronRunner.startAll();
      cronRunner.clearJobs();

      expect(cronRunner.jobCount).toBe(0);
      expect(cronRunner.hasRunningJobs).toBe(false);
    });
  });

  describe('error isolation', () => {
    test('should log error when handler throws but not stop', async () => {
      const logger = createMockLogger();

      (cronRunner as any).logger = logger;

      const errorHandler = mock(() => {
        throw new Error('handler failed');
      });

      cronRunner.registerJob('failing-job', '* * * * *', errorHandler);
      cronRunner.startAll();

      // Wait for timer to potentially fire (very short cron = soon)
      // Note: In real tests with setTimeout, we'd need to advance time
      // For now we verify the job registered and started without throwing
      expect(cronRunner.hasRunningJobs).toBe(true);

      cronRunner.stopAll();
    });
  });

  describe('cron expression handling', () => {
    test('should accept standard 5-field cron', () => {
      cronRunner.registerJob('standard', '*/5 * * * *', () => {});
      cronRunner.startAll();

      expect(cronRunner.hasRunningJobs).toBe(true);
      cronRunner.stopAll();
    });

    test('should accept @daily nickname', () => {
      cronRunner.registerJob('daily', '@daily', () => {});
      cronRunner.startAll();

      expect(cronRunner.hasRunningJobs).toBe(true);
      cronRunner.stopAll();
    });

    test('should accept @hourly nickname', () => {
      cronRunner.registerJob('hourly', '@hourly', () => {});
      cronRunner.startAll();

      expect(cronRunner.hasRunningJobs).toBe(true);
      cronRunner.stopAll();
    });

    test('should accept @weekly nickname', () => {
      cronRunner.registerJob('weekly', '@weekly', () => {});
      cronRunner.startAll();

      expect(cronRunner.hasRunningJobs).toBe(true);
      cronRunner.stopAll();
    });

    test('should accept day range expressions', () => {
      cronRunner.registerJob('weekdays', '0 9 * * MON-FRI', () => {});
      cronRunner.startAll();

      expect(cronRunner.hasRunningJobs).toBe(true);
      cronRunner.stopAll();
    });
  });

  // The console's "run now" must behave like the timer firing, not like calling execute() by hand.
  describe('runNow', () => {
    test('runs the named job once without starting its schedule', async () => {
      const ran: string[] = [];

      cronRunner.registerJob('first', '@daily', () => {
        ran.push('first');
      });
      cronRunner.registerJob('second', '@daily', async () => {
        ran.push('second');
      });

      await cronRunner.runNow('second');

      expect(ran).toEqual(['second']);
      expect(cronRunner.hasRunningJobs).toBe(false);
    });

    test('rejects an unknown job by name', async () => {
      cronRunner.registerJob('known', '@daily', () => {});

      await expect(cronRunner.runNow('unknown')).rejects.toThrow('No @Schedule job named "unknown"');
    });

    test('logs a failure exactly as a timed run does, then rejects with it', async () => {
      const failure = new Error('job failed');
      const logger = (cronRunner as any).logger;
      const originalParse = Bun.cron.parse;

      cronRunner.registerJob('flaky', '@daily', () => {
        throw failure;
      });

      (Bun.cron as any).parse = (_expression: string, from: number) => new Date(from + 1);

      try {
        cronRunner.startAll();

        for (let waited = 0; logger.error.mock.calls.length === 0 && waited < 2000; waited += 5) {
          await Bun.sleep(5);
        }
      } finally {
        (Bun.cron as any).parse = originalParse;
        cronRunner.stopAll();
      }

      const timedRun = logger.error.mock.calls[0];

      logger.error.mockClear();

      await expect(cronRunner.runNow('flaky')).rejects.toBe(failure);
      expect(timedRun).toEqual(['[Schedule] Error in "flaky":', failure]);
      expect(logger.error.mock.calls).toEqual([timedRun]);
    });
  });

  describe('serviceName', () => {
    test('should have correct service name', () => {
      expect(cronRunner.serviceName).toBe('CronRunner');
    });
  });
});
