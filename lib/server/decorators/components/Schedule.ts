import { ComponentType, type ScheduleParams } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';
import { parseCron } from '../../../ioc/helper/cronParser';
import { defineMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../../ioc/constants';

/**
 * Not working right now.
 *
 * @param params
 * @constructor
 */
export const Schedule = (params: ScheduleParams): ClassDecorator => {
  return defineComponent(ComponentType.SCHEDULE, params, (target) => {
    const cronParsed = parseCron((params as ScheduleParams).cron);

    defineMetadata(ComponentConstants.CronKey, cronParsed, target);
  });
};
