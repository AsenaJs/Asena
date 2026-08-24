import type { ValueFields, ValueOptions } from '../../types';
import { ComponentConstants } from '../../constants';
import { defineTypedMetadata, getOwnTypedMetadata } from '../../../utils/typedMetadata';

/**
 * Property decorator to inject a configuration value from the environment.
 *
 * The value is read from `process.env[key]` when the container builds the component.
 * A `parse` function converts the raw string (`parse: Number` for numbers); `default`
 * is used when the variable is not set, and its *presence* is what counts - `0`, `''`
 * and `null` are honored as defaults. A missing variable on a field without a default
 * fails the component's construction - at registration for a singleton, at the first
 * resolve for a transient - with an error naming the class and the field.
 *
 * @param {string} key - Environment variable name
 * @param {ValueOptions} options - Optional `default` and `parse`
 * @returns {PropertyDecorator} - The property decorator function
 *
 * @example
 * ```typescript
 * @Value('DB_POOL_MAX', { parse: Number, default: 10 })
 * private poolMax: number;
 * ```
 *
 * @example
 * ```typescript
 * // Required: no default, boot fails when JWT_SECRET is not set
 * @Value('JWT_SECRET')
 * private jwtSecret: string;
 * ```
 */
export const Value = (key: string, options: ValueOptions = {}): PropertyDecorator => {
  return (target: object, propertyKey: string): void => {
    const fields: ValueFields = getOwnTypedMetadata<ValueFields>(ComponentConstants.ValueKey, target.constructor) || {};

    if (!fields[propertyKey]) {
      fields[propertyKey] = { key, ...options };
    }

    defineTypedMetadata<ValueFields>(ComponentConstants.ValueKey, fields, target.constructor);
  };
};
