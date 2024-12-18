import { ComponentType, type ScheduleParams } from '../../../ioc/types';
import { defineComponent } from '../../../ioc/component';
import { type CronParsed, parseCron } from '../../../ioc/helper/cronParser';
import { ComponentConstants } from '../../../ioc/constants';
import { defineTypedMetadata } from '../../../utils/typedMetadata';

/**
 * @deprecated Not working right now.
 *
 * @param params
 * @constructor
 */
export const Schedule = (params: ScheduleParams): ClassDecorator => {
  return defineComponent(ComponentType.SCHEDULE, params, (target) => {
    const cronParsed = parseCron((params as ScheduleParams).cron);

    defineTypedMetadata<CronParsed>(ComponentConstants.CronKey, cronParsed, target);
  });
};
