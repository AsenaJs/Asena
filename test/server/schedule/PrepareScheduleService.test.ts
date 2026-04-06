import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { PrepareScheduleService } from '../../../lib/server/src/services/PrepareScheduleService';
import { ComponentConstants, ComponentType } from '../../../lib/ioc';
import { defineTypedMetadata } from '../../../lib/utils/typedMetadata';
import { CronRunner } from '../../../lib/server/schedule/CronRunner';

// Mock logger
const createMockLogger = () => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
});

// Helper: create a mock scheduled class with metadata
const createMockScheduleClass = (name: string, cronExpression: string, hasExecute = true) => {
  class MockSchedule {
    execute = hasExecute ? mock(() => {}) : undefined;
  }

  // Set metadata like @Schedule decorator would
  defineTypedMetadata(ComponentConstants.NameKey, name, MockSchedule);
  defineTypedMetadata(ComponentType.SCHEDULE, true, MockSchedule);
  defineTypedMetadata(ComponentConstants.CronKey, cronExpression, MockSchedule);

  return new MockSchedule();
};

describe('PrepareScheduleService', () => {
  let service: PrepareScheduleService;
  let cronRunner: CronRunner;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    service = new PrepareScheduleService();
    cronRunner = new CronRunner();
    mockLogger = createMockLogger();

    // Manually inject dependencies (bypassing IoC for unit tests)
    (cronRunner as any).logger = mockLogger;
    (service as any).logger = mockLogger;
    (service as any).cronRunner = cronRunner;
  });

  describe('prepare - no schedules', () => {
    test('should silently skip when no schedule components exist', async () => {
      const mockContainer = {
        resolveAll: mock(() => null),
      };

      (service as any).container = mockContainer;

      await service.prepare();

      expect(cronRunner.jobCount).toBe(0);
    });

    test('should silently skip when schedule array is empty', async () => {
      const mockContainer = {
        resolveAll: mock(() => []),
      };

      (service as any).container = mockContainer;

      await service.prepare();

      expect(cronRunner.jobCount).toBe(0);
    });
  });

  describe('prepare - with schedules', () => {
    test('should register schedule with CronRunner', async () => {
      const schedule = createMockScheduleClass('TestTask', '* * * * *');

      const mockContainer = {
        resolveAll: mock(() => [schedule]),
      };

      (service as any).container = mockContainer;

      await service.prepare();

      expect(cronRunner.jobCount).toBe(1);
      expect(cronRunner.getJobNames()).toEqual(['TestTask']);
    });

    test('should register multiple schedules', async () => {
      const schedule1 = createMockScheduleClass('Task1', '* * * * *');
      const schedule2 = createMockScheduleClass('Task2', '@daily');
      const schedule3 = createMockScheduleClass('Task3', '0 9 * * MON-FRI');

      const mockContainer = {
        resolveAll: mock(() => [schedule1, schedule2, schedule3]),
      };

      (service as any).container = mockContainer;

      await service.prepare();

      expect(cronRunner.jobCount).toBe(3);
      expect(cronRunner.getJobNames()).toEqual(['Task1', 'Task2', 'Task3']);
    });

    test('should throw when execute() method is missing', async () => {
      const schedule = createMockScheduleClass('BadTask', '* * * * *', false);

      const mockContainer = {
        resolveAll: mock(() => [schedule]),
      };

      (service as any).container = mockContainer;

      expect(service.prepare()).rejects.toThrow(
        '@Schedule class "BadTask" must implement AsenaSchedule interface (missing execute() method)',
      );
    });

    test('should warn and skip when cron expression is missing', async () => {
      class NoMetaSchedule {
        execute() {}
      }

      // Set name but NO cron key
      defineTypedMetadata(ComponentConstants.NameKey, 'NoMetaTask', NoMetaSchedule);
      defineTypedMetadata(ComponentType.SCHEDULE, true, NoMetaSchedule);

      const instance = new NoMetaSchedule();

      const mockContainer = {
        resolveAll: mock(() => [instance]),
      };

      (service as any).container = mockContainer;

      await service.prepare();

      expect(cronRunner.jobCount).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('handler binding', () => {
    test('should bind execute to instance (preserve this context)', async () => {
      let capturedThis: any = null;

      class ContextCheckSchedule {
        value = 'bound-correctly';

        execute() {
          capturedThis = this;
        }
      }

      const instance = new ContextCheckSchedule();

      defineTypedMetadata(ComponentConstants.NameKey, 'ContextCheck', ContextCheckSchedule);
      defineTypedMetadata(ComponentType.SCHEDULE, true, ContextCheckSchedule);
      defineTypedMetadata(ComponentConstants.CronKey, '* * * * *', ContextCheckSchedule);

      const mockContainer = {
        resolveAll: mock(() => [instance]),
      };

      (service as any).container = mockContainer;

      await service.prepare();

      // Manually trigger the registered handler to verify binding
      const jobs = (cronRunner as any).jobs;

      expect(jobs).toHaveLength(1);

      await jobs[0].handler();

      expect(capturedThis).toBe(instance);
      expect(capturedThis.value).toBe('bound-correctly');
    });
  });

  describe('serviceName', () => {
    test('should have correct service name', () => {
      expect(service.serviceName).toBe('PrepareScheduleService');
    });
  });
});
