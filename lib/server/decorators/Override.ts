import {defineMetadata} from "reflect-metadata/no-conflict";
import {ComponentConstants} from "../../ioc/constants";

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
        defineMetadata(ComponentConstants.OverrideKey, true, target);
    };
};