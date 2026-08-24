import type { Class } from '../../server/types';
import type { ValueFields, ValueSpec } from '../types';
import { ComponentConstants } from '../constants';
import { getOwnTypedMetadata } from '../../utils/typedMetadata';

/**
 * Collects the @Value fields of a class as a single record.
 *
 * Same walk and stop rules as the test utilities' discovery: up the constructor chain,
 * halting at `Function.prototype` or a class whose source reads `[native code]`. The
 * chain is merged ancestors-first, so a field redeclared in a subclass overwrites the
 * base class entry - the same subclass-wins rule @Inject fields follow.
 *
 * @param ComponentClass - Component class to inspect
 * @returns The merged `{ [field]: { key, default?, parse? } }` record
 */
export function collectValueFields(ComponentClass: any): ValueFields {
  const chain: any[] = [];

  let currentClass = ComponentClass;

  while (currentClass && currentClass !== Function.prototype) {
    if (typeof currentClass !== 'function' || currentClass.toString().includes('[native code]')) {
      break;
    }

    chain.unshift(currentClass);
    currentClass = Object.getPrototypeOf(currentClass);
  }

  const fields: ValueFields = {};

  for (const classInChain of chain) {
    Object.assign(fields, getOwnTypedMetadata<ValueFields>(ComponentConstants.ValueKey, classInChain) || {});
  }

  return fields;
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
