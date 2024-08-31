import {
  type ComponentParams,
  ComponentType,
  type ControllerParams,
  type ScheduleParams,
  type ServiceParams,
} from '../../ioc/types';
import { defineMetadata } from 'reflect-metadata/no-conflict';
import { CronKey, MiddlewaresKey, PathKey } from '../../ioc/constants';
import { parseCron } from '../../ioc/helper/cronParser.ts';
import { defineComponent } from '../../ioc/component/component.ts';

export const Component = (params?: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.COMPONENT, params);
};

export const Service = (params?: ServiceParams | string): ClassDecorator => {
  return defineComponent(ComponentType.SERVICE, params);
};

export const Controller = (params?: ControllerParams | string): ClassDecorator => {
  const _params = typeof params === 'string' ? { path: params, name: undefined } : params;

  return defineComponent(ComponentType.CONTROLLER, _params, (target) => {
    defineMetadata(PathKey, (_params as ControllerParams).path || '', target);

    defineMetadata(MiddlewaresKey, (_params as ControllerParams).middlewares || [], target);
  });
};

export const ServerService = (params?: ComponentParams): ClassDecorator => {
  return defineComponent(ComponentType.SERVER_SERVICE, params);
};

export const Schedule = (params: ScheduleParams): ClassDecorator => {
  return defineComponent(ComponentType.SCHEDULE, params, (target) => {
    const cronParsed = parseCron((params as ScheduleParams).cron);

    defineMetadata(CronKey, cronParsed, target);
  });
};

export const Middleware = (params?: ComponentParams): ClassDecorator => {
  return defineComponent(ComponentType.MIDDLEWARE, params, (target) => {
    if (typeof target.prototype.filter !== 'function') {
      throw new Error(`Class ${target.name} must implement a 'filter(req, res, next)' method.`);
    }
  });
};
