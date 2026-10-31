import { describe, expect, test } from 'bun:test';
import { Controller } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import {
  ASENA_CONTEXT_ADAPTER,
  ASENA_CONTEXT_CONTRACT,
  ContractValidationError,
  ValidatedInput,
  assertContextAdapter,
  assertRouteContract,
  defineRequestSchemas,
  prepareContextValidation,
  readContractBody,
  readContractForm,
  resolveContextContract,
  type InputTarget,
  type RequestSchema,
} from '../../lib/adapter/RequestContract';
import { isValidationError } from '../../lib/adapter/types/ValidationError';

function schema<T>(validate: (value: unknown) => T | Promise<T>): RequestSchema<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async (value) => ({ value: await validate(value) }),
    },
  };
}

describe('request contract', () => {
  test('freezes the target map and checks each schema', () => {
    const body = schema((value) => value);
    const schemas = defineRequestSchemas({ body });

    expect(Object.isFrozen(schemas)).toBe(true);
    expect(schemas.body).toBe(body);
    expect(() => defineRequestSchemas({ body, form: body })).toThrow('both body and form');
    expect(() => defineRequestSchemas({ body: {} as any })).toThrow('Standard Schema v1');
    expect(() => defineRequestSchemas({ cookie: body } as any)).toThrow('Unknown context input target');
  });

  test('resolves a value-imported first parameter on its actual method owner', () => {
    class DefinedContext {
      static readonly [ASENA_CONTEXT_CONTRACT] = defineRequestSchemas({ body: schema((value) => value) });
      static readonly [ASENA_CONTEXT_ADAPTER] = 'ergenecore';
    }

    @Controller('/base')
    class BaseController {
      @Get('/')
      route(_context: DefinedContext) {}
    }

    class InheritedController extends BaseController {}

    class OverrideController extends BaseController {
      override route(_context: object) {}
    }

    expect(resolveContextContract(new BaseController(), 'route')).toBe(DefinedContext as any);
    expect(resolveContextContract(new InheritedController(), 'route')).toBe(DefinedContext as any);
    expect(resolveContextContract(new OverrideController(), 'route')).toBeUndefined();
    expect(() => assertContextAdapter(DefinedContext as any, 'hono-adapter')).toThrow('belongs to');
    expect(() => assertRouteContract({ validator: {} as any }, DefinedContext as any, 'GET /base')).toThrow('both');
    expect(() => assertRouteContract({ validatorCache: false }, undefined, 'GET /base')).toThrow('requires');
  });

  test('validates in target order, retains transformed undefined, and only publishes after completion', async () => {
    const calls: string[] = [];
    const schemas = defineRequestSchemas({
      body: schema(async () => {
        calls.push('body');
        return undefined;
      }),
      query: schema(() => {
        calls.push('query');
        return { page: 2 };
      }),
      params: schema(() => {
        calls.push('params');
        return { id: 1 };
      }),
      headers: schema(() => {
        calls.push('headers');
        return { authorization: 'ok' };
      }),
    });
    const state = new ValidatedInput<{
      body: undefined;
      query: { page: number };
      params: { id: number };
      headers: { authorization: string };
    }>();
    const validate = prepareContextValidation(schemas);

    expect(() => state.input).toThrow('only available after');

    await validate({
      readContractInput: (target: InputTarget) => target,
      setValidated: (target, value) => state.set(target, value),
      completeValidatedInput: () => state.complete(),
    });

    expect(calls).toEqual(['body', 'query', 'params', 'headers']);
    expect(state.has('body')).toBe(true);
    expect(state.input.body).toBeUndefined();
    expect(state.input.query).toEqual({ page: 2 });
    expect(Object.isFrozen(state.input)).toBe(true);
  });

  test('normalizes Standard Schema issues and stops after first failure', async () => {
    const calls: string[] = [];
    const failing: RequestSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({ issues: [{ message: 'bad', path: [{ key: 'user' }, 0] }] }),
      },
    };
    const validate = prepareContextValidation({
      query: failing,
      params: schema(() => {
        calls.push('params');
        return {};
      }),
    });
    const state = new ValidatedInput();

    try {
      await validate({
        readContractInput: () => ({}),
        setValidated: (target, value) => state.set(target, value),
        completeValidatedInput: () => state.complete(),
      });
      throw new Error('expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect(isValidationError(error)).toBe(true);
      expect((error as ContractValidationError).status).toBe(400);
      expect((error as ContractValidationError).issues).toEqual([{ message: 'bad', path: ['user', 0] }]);
    }

    expect(calls).toEqual([]);
    expect(() => state.input).toThrow();
  });

  test('reads JSON and form bodies with explicit media and parse errors', async () => {
    const bytes = (text: string) => async () => new TextEncoder().encode(text).buffer;

    expect(await readContractBody(bytes(''), '')).toBeUndefined();
    expect(await readContractBody(bytes('{"ok":true}'), 'application/json; charset=utf-8')).toEqual({ ok: true });
    await expect(readContractBody(bytes('{'), 'application/json')).rejects.toMatchObject({ status: 400 });
    await expect(readContractBody(bytes('{}'), 'text/plain')).rejects.toMatchObject({ status: 415 });

    const data = new FormData();
    data.append('tag', 'a');
    data.append('tag', 'b');
    expect(await readContractForm(async () => data, 'multipart/form-data; boundary=x')).toEqual({ tag: ['a', 'b'] });
    await expect(readContractForm(async () => data, 'application/json')).rejects.toMatchObject({ status: 415 });
  });
});
