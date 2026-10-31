import 'reflect-metadata';
import { getOwnMetadata } from 'reflect-metadata/no-conflict';
import type { AsenaContext } from './AsenaContext';
import { HttpException } from './types/HttpException';
import { VALIDATION_ERROR, type ValidationIssue, type ValidationErrorLike } from './types/ValidationError';

/** Structural consumer of Standard Schema v1 (https://standardschema.dev).
 * Kept local deliberately: neither runtime nor published declarations require a schema package.
 */
export interface RequestSchema<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: Input; readonly output: Output };
    readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>;
  };
}

export interface SchemaIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

export type SchemaResult<T> =
  { readonly value: T; readonly issues?: undefined } | { readonly issues: readonly SchemaIssue[] };

export type InputTarget = 'body' | 'form' | 'query' | 'params' | 'headers';
export type InputMap = Partial<Record<InputTarget, unknown>>;
export type RequestSchemas = Partial<Record<InputTarget, RequestSchema>>;
export type InferSchemaOutput<S extends RequestSchema> = NonNullable<S['~standard']['types']>['output'];
export type InferInputs<S extends RequestSchemas> = {
  readonly [K in keyof S]: S[K] extends RequestSchema ? InferSchemaOutput<S[K]> : never;
};
export type InputOutput<I, K extends InputTarget> = K extends keyof I ? I[K] : unknown;
export type ExactRequestSchemas<S extends RequestSchemas> = S & Record<Exclude<keyof S, InputTarget>, never>;

export const ASENA_CONTEXT_CONTRACT = Symbol.for('asena.contextContract.v1');
export const ASENA_CONTEXT_ADAPTER = Symbol.for('asena.contextAdapter.v1');
export interface ContractContextClass<C = AsenaContext<any, any>> {
  new (...args: any[]): C;
  readonly [ASENA_CONTEXT_CONTRACT]: Readonly<RequestSchemas>;
  readonly [ASENA_CONTEXT_ADAPTER]: string;
}

const INPUT_TARGETS: readonly InputTarget[] = ['body', 'form', 'query', 'params', 'headers'];

export function defineRequestSchemas<S extends RequestSchemas>(schemas: ExactRequestSchemas<S>): Readonly<S> {
  if (!schemas || typeof schemas !== 'object') throw new Error('Context.define expects a schema map');
  for (const [key, schema] of Object.entries(schemas)) {
    if (!INPUT_TARGETS.includes(key as InputTarget)) throw new Error(`Unknown context input target '${key}'`);
    const standard = schema?.['~standard'];
    if (standard?.version !== 1 || typeof standard.vendor !== 'string' || typeof standard.validate !== 'function') {
      throw new Error(`Context input '${key}' must implement Standard Schema v1`);
    }
  }
  if (schemas.body && schemas.form) throw new Error('Context.define cannot declare both body and form');
  return Object.freeze({ ...schemas });
}

/** Resolve the actual method owner, so an undecorated override never inherits a stale parameter type. */
export function resolveContextContract(controller: object, methodName: string): ContractContextClass | undefined {
  let owner = Object.getPrototypeOf(controller);
  while (owner && !Object.hasOwn(owner, methodName)) owner = Object.getPrototypeOf(owner);
  if (!owner) return undefined;
  const [candidate] = getOwnMetadata('design:paramtypes', owner, methodName) ?? [];
  if (typeof candidate !== 'function' || !candidate[ASENA_CONTEXT_CONTRACT]) return undefined;
  return candidate as ContractContextClass;
}

export function assertRouteContract(
  params: { validator?: unknown; validatorCache?: boolean; contextContract?: Readonly<RequestSchemas> },
  contextClass: ContractContextClass | undefined,
  label: string,
): void {
  if (params.validatorCache !== undefined && typeof params.validatorCache !== 'boolean') {
    throw new Error(`${label}: validatorCache must be a boolean`);
  }
  if (params.contextContract && params.contextContract !== contextClass?.[ASENA_CONTEXT_CONTRACT]) {
    throw new Error(`${label}: contextContract must match contextClass`);
  }
  if (contextClass && params.validator) {
    throw new Error(
      `${label} declares validation through both ${contextClass.name} and the validator option. Choose one validation source.`,
    );
  }
  if (params.validatorCache !== undefined && (!params.validator || contextClass)) {
    throw new Error(`${label}: validatorCache requires a legacy validator`);
  }
}

export function assertContextAdapter(contextClass: ContractContextClass | undefined, adapter: string): void {
  if (contextClass && contextClass[ASENA_CONTEXT_ADAPTER] !== adapter) {
    throw new Error(
      `Context '${contextClass.name}' belongs to '${contextClass[ASENA_CONTEXT_ADAPTER]}', not '${adapter}'`,
    );
  }
}

/** Per-request storage. Presence is independent of value, including successful undefined output. */
export class ValidatedInput<I extends InputMap = Record<never, never>> {
  private readonly values: InputMap = Object.create(null);
  private ready = false;

  public has(key: InputTarget): boolean {
    return Object.hasOwn(this.values, key);
  }
  public get(key: InputTarget): unknown {
    return this.values[key];
  }
  public set(key: InputTarget, value: unknown): void {
    if (this.ready) throw new Error('Validated input is already complete');
    this.values[key] = value;
  }
  public complete(): void {
    Object.freeze(this.values);
    this.ready = true;
  }
  public get input(): Readonly<I> {
    if (!this.ready) throw new Error('Context input is only available after route validation');
    return this.values as Readonly<I>;
  }
}

export class ContractValidationError extends HttpException implements ValidationErrorLike {
  public readonly [VALIDATION_ERROR] = true as const;
  public readonly issues: ValidationIssue[];
  public readonly cause: readonly SchemaIssue[];

  public constructor(
    public readonly target: InputTarget,
    issues: readonly SchemaIssue[],
  ) {
    const normalized = issues.map((issue) => ({
      message: issue.message,
      path: (issue.path ?? []).map((segment) => {
        const key: PropertyKey =
          segment !== null && typeof segment === 'object' ? segment.key : (segment as PropertyKey);
        return typeof key === 'symbol' ? key.toString() : key;
      }),
    }));
    super(400, { error: 'Validation failed', target, issues: normalized });
    this.name = 'ContractValidationError';
    this.issues = normalized;
    this.cause = issues;
  }
}

export interface ContractInputContext {
  readContractInput(target: InputTarget): Promise<unknown> | unknown;
  setValidated(target: InputTarget, value: unknown): void;
  completeValidatedInput(): void;
}

/** Prepared once per route. No schema factory, target scan or metadata lookup on the request path. */
export function prepareContextValidation(schemas: RequestSchemas): (context: ContractInputContext) => Promise<void> {
  const steps = INPUT_TARGETS.filter((key) => schemas[key]).map((target) => ({ target, schema: schemas[target] }));
  return async (context) => {
    for (const { target, schema } of steps) {
      const result = await schema['~standard'].validate(await context.readContractInput(target));
      if (result.issues) throw new ContractValidationError(target, result.issues);
      context.setValidated(target, (result as { value: unknown }).value);
    }
    context.completeValidatedInput();
  };
}

/** Shared extraction rules for contract routes only; legacy extraction remains adapter-owned. */
export async function readContractBody(bytes: () => Promise<ArrayBuffer>, contentType: string): Promise<unknown> {
  const raw = await bytes();
  if (raw.byteLength === 0) return undefined;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json' && !/^application\/[^;]+\+json$/.test(mediaType)) {
    throw new HttpException(415, 'Expected a JSON request body');
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new HttpException(400, 'Invalid JSON in request body');
  }
}

export async function readContractForm(read: () => Promise<FormData>, contentType: string): Promise<unknown> {
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'multipart/form-data' && mediaType !== 'application/x-www-form-urlencoded') {
    throw new HttpException(415, 'Expected a form request body');
  }
  let data: FormData;
  try {
    data = await read();
  } catch {
    throw new HttpException(400, 'Invalid form request body');
  }
  const values: Record<string, unknown> = Object.create(null);
  data.forEach((value, key) => {
    if (!Object.hasOwn(values, key)) values[key] = value;
    else if (Array.isArray(values[key])) (values[key] as unknown[]).push(value);
    else values[key] = [values[key], value];
  });
  return values;
}
