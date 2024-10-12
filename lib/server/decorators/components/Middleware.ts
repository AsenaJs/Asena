import type {MiddlewareParams} from "../../../ioc/types/decorators/MiddlewareParams";
import {defineComponent} from "../../../ioc/component/componentUtils";
import {ComponentType} from "../../../ioc/types";
import {defineMetadata, getMetadata} from "reflect-metadata/no-conflict";
import {ComponentConstants} from "../../../ioc/constants";

/**
 * Decorator for defining a Middleware component.
 *
 * @param {MiddlewareParams} [params] - Optional parameters for the middleware.
 * @returns {ClassDecorator} - The class decorator for the middleware.
 */
export const Middleware = (params?: MiddlewareParams): ClassDecorator => {
    return defineComponent(ComponentType.MIDDLEWARE, params, (target) => {
        defineMetadata(ComponentConstants.IsMiddlewareKey, true, target);

        const overdrive = getMetadata(ComponentConstants.OverrideKey, target);

        defineMetadata(ComponentConstants.OverrideKey, overdrive || params?.override || false, target);

        if (typeof target.prototype.handle !== 'function') {
            throw new Error(`Class ${target.name} must implement a 'filter(req, res, next)' method.`);
        }
    });
};