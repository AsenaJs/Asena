import { ComponentConstants } from '../../constants';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils/typedMetadata';

/**
 * A decorator that marks a method to be called when the server stops.
 *
 * The counterpart to {@link OnStart}. Runs during `server.stop()`, in the reverse of start
 * order, so a component still has its dependencies while it releases its own resources. The
 * HTTP surface is already down by then and the microservice transports are still up, which
 * makes this the place to finish in-flight work and publish a last message.
 *
 * A hook that throws or exceeds the shutdown timeout is logged and skipped - shutdown
 * continues. One component failing to let go must not strand the rest.
 *
 * Only components whose start hook completed are stopped. A `stop()` on a server that never
 * started, or that failed during boot, runs nothing that never ran.
 *
 * @returns {PropertyDecorator} The property decorator function.
 */
export const OnStop = (): PropertyDecorator => {
  return (target: object, propertyKey: string): void => {
    const hooks: string[] = getOwnTypedMetadata<string[]>(ComponentConstants.OnStopKey, target.constructor) || [];

    if (!hooks.includes(propertyKey)) {
      hooks.push(propertyKey);
    }

    defineTypedMetadata<string[]>(ComponentConstants.OnStopKey, hooks, target.constructor);
  };
};
