import { describe, expect, test } from 'bun:test';
import { Schedule } from '../../../lib/server/decorators/components/Schedule';
import { ComponentConstants, ComponentType } from '../../../lib/ioc';
import { getOwnTypedMetadata, getTypedMetadata } from '../../../lib/utils/typedMetadata';

describe('@Schedule decorator', () => {
  test('should register component as SCHEDULE type', () => {
    @Schedule({ cron: '* * * * *' })
    class TestTask {}

    const isSchedule = getTypedMetadata(ComponentType.SCHEDULE, TestTask);

    expect(isSchedule).toBeTruthy();
  });

  test('should store cron expression in metadata', () => {
    @Schedule({ cron: '*/5 * * * *' })
    class TestTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, TestTask);

    expect(cron).toBe('*/5 * * * *');
  });

  test('should store custom name in metadata', () => {
    @Schedule({ cron: '* * * * *', name: 'my-custom-task' })
    class TestTask {}

    const name = getTypedMetadata<string>(ComponentConstants.NameKey, TestTask);

    expect(name).toBe('my-custom-task');
  });

  test('should accept @daily nickname', () => {
    @Schedule({ cron: '@daily' })
    class DailyTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, DailyTask);

    expect(cron).toBe('@daily');
  });

  test('should accept @hourly nickname', () => {
    @Schedule({ cron: '@hourly' })
    class HourlyTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, HourlyTask);

    expect(cron).toBe('@hourly');
  });

  test('should accept @weekly nickname', () => {
    @Schedule({ cron: '@weekly' })
    class WeeklyTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, WeeklyTask);

    expect(cron).toBe('@weekly');
  });

  test('should accept @monthly nickname', () => {
    @Schedule({ cron: '@monthly' })
    class MonthlyTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, MonthlyTask);

    expect(cron).toBe('@monthly');
  });

  test('should accept @yearly nickname', () => {
    @Schedule({ cron: '@yearly' })
    class YearlyTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, YearlyTask);

    expect(cron).toBe('@yearly');
  });

  test('should accept day range expression', () => {
    @Schedule({ cron: '0 9 * * MON-FRI' })
    class WeekdayTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, WeekdayTask);

    expect(cron).toBe('0 9 * * MON-FRI');
  });

  test('should accept step expression', () => {
    @Schedule({ cron: '*/15 * * * *' })
    class StepTask {}

    const cron = getTypedMetadata<string>(ComponentConstants.CronKey, StepTask);

    expect(cron).toBe('*/15 * * * *');
  });

  test('should throw on invalid cron expression', () => {
    expect(() => {
      @Schedule({ cron: 'invalid-cron' })
      class BadTask {}
    }).toThrow('Invalid cron expression');
  });

  test('should throw on empty cron expression', () => {
    expect(() => {
      @Schedule({ cron: '' })
      class EmptyTask {}
    }).toThrow();
  });

  test('should mark as IOC object', () => {
    @Schedule({ cron: '* * * * *' })
    class TestTask {}

    const isIoc = getTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, TestTask);

    expect(isIoc).toBeTruthy();
  });
});