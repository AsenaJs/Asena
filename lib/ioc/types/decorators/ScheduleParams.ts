import type { ComponentParams } from './ComponentParams';

export interface ScheduleParams extends ComponentParams {
  cron: string;
}
