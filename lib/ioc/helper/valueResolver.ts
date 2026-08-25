import type { Class } from '../../server/types';
import type { ValueFields, ValueSpec } from '../types';
import { ComponentConstants } from '../constants';
import { getChainedTypedMetadata } from '../../utils/typedMetadata';

/**
 * Collects the @Value fields of a class as a single record: the whole prototype chain,
 * ancestors first, so a field redeclared in a subclass overwrites the base class entry -
 * the same subclass-wins rule @Inject fields follow.
 *
 * @param ComponentClass - Component class to inspect
 * @returns The merged `{ [field]: { key, default?, parse? } }` record
 */
export function collectValueFields(ComponentClass: any): ValueFields {
  return getChainedTypedMetadata<ValueFields>(ComponentConstants.ValueKey, ComponentClass);
}

/**
 * Resolves one @Value field against `process.env`.
 *
 * A set variable wins and goes through `parse` when one was given. An unset variable
 * falls back to `default` - presence of the option, not its truthiness, so `0`, `''`
 * and `null` are respected - and only a field with neither throws.
 *
 * @param spec - The stored field metadata: env key plus options
 * @param Class - The class owning the field, for the error message
 * @param field - The field name, for the error message
 * @returns The resolved value: parsed env string, or the default
 * @throws When the variable is not set and no default was given
 */
export function readValue(spec: ValueSpec, Class: Class, field: string): unknown {
  const raw = process.env[spec.key];

  if (raw !== undefined) {
    return spec.parse ? spec.parse(raw) : raw;
  }

  if ('default' in spec) {
    return spec.default;
  }

  throw new Error(
    `@Value('${spec.key}') on ${Class.name}.${field}: environment variable is not set and no default was given`,
  );
}
