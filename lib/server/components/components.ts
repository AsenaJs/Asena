import {
  type ComponentParams,
  ComponentType,
  type ControllerParams,
  type ScheduleParams,
  type ServiceParams,
} from '../../ioc/types';
import { defineMetadata, getMetadata } from 'reflect-metadata/no-conflict';
import { CronKey, IsMiddlewareKey, MiddlewaresKey, OverrideKey, PathKey } from '../../ioc/constants';
import { parseCron } from '../../ioc/helper/cronParser';
import { defineComponent } from '../../ioc/component/component';
import { defineMiddleware } from '../web/helper/defineMiddleware';
import type { MiddlewareParams } from '../../ioc/types/decorators/MiddlewareParams.ts';

/**
 * Decorator for defining a generic Component.
 *
 * @param {ComponentParams | string} [params] - Optional parameters for the component. A string can be used for defining the name.
 * @returns {ClassDecorator} - The class decorator for the component.
 */
export const Component = (params?: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.COMPONENT, params);
};


/**
 * Decorator for defining a Service component.
 *
 * @param {ServiceParams | string} [params] - Optional parameters for the service. string is used for defining the name.
 * @returns {ClassDecorator} - The class decorator for the service.
 */
export const Service = (params?: ServiceParams | string): ClassDecorator => {
  return defineComponent(ComponentType.SERVICE, params);
};

/**
 * Decorator for defining a Controller component. String is used for defining the path.
 *
 * @param {ControllerParams | string} [params] - Optional parameters for the controller.
 * @returns {ClassDecorator} - The class decorator for the controller.
 */
export const Controller = (params?: ControllerParams | string): ClassDecorator => {
  const _params =
    typeof params === 'string' ? { path: params, name: undefined } : params || { path: '', name: undefined };

  return defineComponent(ComponentType.CONTROLLER, _params, (target) => {
    defineMetadata(PathKey, (_params as ControllerParams).path || '', target);

    defineMiddleware(target, (_params as ControllerParams).middlewares || []);

    defineMetadata(MiddlewaresKey, (_params as ControllerParams).middlewares || [], target);
  });
};

/**
 * Decorator for defining a Server Service component.
 * This is a special type of service starts with the server.(e.g. DatabaseService, RedisService)
 *
 * @param {ComponentParams} [params] - Optional parameters for the server service.
 * @returns {ClassDecorator} - The class decorator for the server service.
 */
export const ServerService = (params?: ComponentParams): ClassDecorator => {
  return defineComponent(ComponentType.SERVER_SERVICE, params);
};


/**
 * Not working right now.
 *
 * @param params
 * @constructor
 */
export const Schedule = (params: ScheduleParams): ClassDecorator => {
  return defineComponent(ComponentType.SCHEDULE, params, (target) => {
    const cronParsed = parseCron((params as ScheduleParams).cron);

    defineMetadata(CronKey, cronParsed, target);
  });
};


/**
 * Decorator for defining a Middleware component.
 *
 * @param {MiddlewareParams} [params] - Optional parameters for the middleware.
 * @returns {ClassDecorator} - The class decorator for the middleware.
 */
export const Middleware = (params?: MiddlewareParams): ClassDecorator => {
  return defineComponent(ComponentType.MIDDLEWARE, params, (target) => {
    defineMetadata(IsMiddlewareKey, true, target);

    const overdrive = getMetadata(OverrideKey, target);

    defineMetadata(OverrideKey, overdrive || params?.override || false, target);

    if (typeof target.prototype.handle !== 'function') {
      throw new Error(`Class ${target.name} must implement a 'filter(req, res, next)' method.`);
    }
  });
};

/**
 * Decorator for defining a WebSocket component.
 *
 * @param {ControllerParams | string} [params] - Optional parameters for the WebSocket. A string can be used for defining the path.
 * @returns {ClassDecorator} - The class decorator for the WebSocket.
 */
export const WebSocket = (params?: ControllerParams | string): ClassDecorator => {
  return defineComponent(ComponentType.WEBSOCKET, params, (target) => {
    defineMetadata(PathKey, (params as ControllerParams).path || '', target);

    defineMiddleware(target, (params as ControllerParams).middlewares || []);

    defineMetadata(MiddlewaresKey, (params as ControllerParams).middlewares || [], target);
  });
};


/**
 * Decorator for marking a class as an override.
 *
 * This decorator sets a metadata key to indicate that the class is an override.
 *
 * For now, it's only using in middleware.
 *
 * @returns {ClassDecorator} - The class decorator for the override.
 */
export const Override = (): ClassDecorator => {
  return (target: Function) => {
    defineMetadata(OverrideKey, true, target);
  };
};
