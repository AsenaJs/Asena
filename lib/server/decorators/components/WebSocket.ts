import {ComponentType, type ControllerParams} from "../../../ioc/types";
import {defineComponent} from "../../../ioc/component/componentUtils";
import {defineMetadata} from "reflect-metadata/no-conflict";
import {ComponentConstants} from "../../../ioc/constants";
import {defineMiddleware} from "../../web/helper/defineMiddleware";

/**
 * Decorator for defining a WebSocket component.
 *
 * @param {ControllerParams | string} [params] - Optional parameters for the WebSocket. A string can be used for defining the path.
 * @returns {ClassDecorator} - The class decorator for the WebSocket.
 */
export const WebSocket = (params?: ControllerParams | string): ClassDecorator => {
    return defineComponent(ComponentType.WEBSOCKET, params, (target) => {
        defineMetadata(ComponentConstants.PathKey, (params as ControllerParams).path || '', target);

        defineMiddleware(target, (params as ControllerParams).middlewares || []);

        defineMetadata(ComponentConstants.MiddlewaresKey, (params as ControllerParams).middlewares || [], target);
    });
};