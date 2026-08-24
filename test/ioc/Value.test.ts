import { afterEach, describe, expect, test } from 'bun:test';
import { Container } from '../../lib/ioc';
import { Component } from '../../lib/server/decorators';
import { Value } from '../../lib/ioc/component';

const touchedKeys: string[] = [];

const setEnv = (key: string, value: string | undefined): void => {
  touchedKeys.push(key);

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

@Component()
class UrlService {
  @Value('ASENA_TEST_VALUE_URL')
  private url: string;

  public getUrl(): string {
    return this.url;
  }
}

@Component()
class PoolService {
  @Value('ASENA_TEST_VALUE_POOL_MAX', { parse: Number, default: 10 })
  private poolMax: number;

  public getPoolMax(): number {
    return this.poolMax;
  }
}

@Component()
class DefaultingService {
  @Value('ASENA_TEST_VALUE_ZERO', { default: 0 })
  private zero: number;

  @Value('ASENA_TEST_VALUE_EMPTY', { default: '' })
  private empty: string;

  @Value('ASENA_TEST_VALUE_NULL', { default: null })
  private nullable: unknown;

  public getZero(): number {
    return this.zero;
  }

  public getEmpty(): string {
    return this.empty;
  }

  public getNullable(): unknown {
    return this.nullable;
  }
}

@Component()
class RequiredService {
  @Value('ASENA_TEST_VALUE_REQUIRED')
  private requiredField: string;

  public getRequired(): string {
    return this.requiredField;
  }
}

@Component()
class BaseValueService {
  @Value('ASENA_TEST_VALUE_BASE')
  public baseField: string;
}

@Component()
class SubValueService extends BaseValueService {
  @Value('ASENA_TEST_VALUE_SUB')
  public override baseField: string;
}

@Component()
class InheritingService extends BaseValueService {
  public readBaseField(): string {
    return this.baseField;
  }
}

@Component()
class InitializedService {
  @Value('ASENA_TEST_VALUE_INITIALIZER')
  private field = 'initializer-value';

  public getField(): string {
    return this.field;
  }
}

describe('@Value configuration injection', () => {
  afterEach(() => {
    for (const key of touchedKeys.splice(0)) {
      delete process.env[key];
    }
  });

  test('reads a set variable from the environment', async () => {
    setEnv('ASENA_TEST_VALUE_URL', 'postgres://localhost/app');

    const container = new Container();
    await container.register('UrlService', UrlService, true);

    const instance = (await container.resolve<UrlService>('UrlService')) as UrlService;

    expect(instance.getUrl()).toBe('postgres://localhost/app');
  });

  test('parse: Number converts the raw string', async () => {
    setEnv('ASENA_TEST_VALUE_POOL_MAX', '30');

    const container = new Container();
    await container.register('PoolService', PoolService, true);

    const instance = (await container.resolve<PoolService>('PoolService')) as PoolService;

    expect(instance.getPoolMax()).toBe(30);
  });

  test('default is used when the variable is unset, including 0 and empty string', async () => {
    const container = new Container();
    await container.register('DefaultingService', DefaultingService, true);

    const instance = (await container.resolve<DefaultingService>('DefaultingService')) as DefaultingService;

    expect(instance.getZero()).toBe(0);
    expect(instance.getEmpty()).toBe('');
    expect(instance.getNullable()).toBe(null);
  });

  test('default is used when the variable is unset even for a parsed field', async () => {
    const container = new Container();
    await container.register('PoolService', PoolService, true);

    const instance = (await container.resolve<PoolService>('PoolService')) as PoolService;

    expect(instance.getPoolMax()).toBe(10);
  });

  test('unset variable with no default fails registration naming class, field and key', async () => {
    const container = new Container();

    await expect(container.register('RequiredService', RequiredService, true)).rejects.toThrow(
      "@Value('ASENA_TEST_VALUE_REQUIRED') on RequiredService.requiredField: environment variable is not set and no default was given",
    );
  });

  test('a @Value on a base class is applied to the subclass instance', async () => {
    setEnv('ASENA_TEST_VALUE_BASE', 'from-base');

    const container = new Container();
    await container.register('InheritingService', InheritingService, true);

    const instance = (await container.resolve<InheritingService>('InheritingService')) as InheritingService;

    expect(instance.readBaseField()).toBe('from-base');
  });

  test('a subclass redeclaring the field with another key wins', async () => {
    setEnv('ASENA_TEST_VALUE_BASE', 'from-base');
    setEnv('ASENA_TEST_VALUE_SUB', 'from-sub');

    const container = new Container();
    await container.register('SubValueService', SubValueService, true);

    const instance = (await container.resolve<SubValueService>('SubValueService')) as SubValueService;

    expect(instance.baseField).toBe('from-sub');
    expect(instance.baseField).not.toBe('from-base');
  });

  test('a field with an initializer is not overwritten', async () => {
    setEnv('ASENA_TEST_VALUE_INITIALIZER', 'from-env');

    const container = new Container();
    await container.register('InitializedService', InitializedService, true);

    const instance = (await container.resolve<InitializedService>('InitializedService')) as InitializedService;

    expect(instance.getField()).toBe('initializer-value');
  });

  test('the resolved value is a plain writable property, not an accessor', async () => {
    setEnv('ASENA_TEST_VALUE_URL', 'postgres://localhost/app');

    const container = new Container();
    await container.register('UrlService', UrlService, true);

    const instance = (await container.resolve<UrlService>('UrlService')) as UrlService;
    const descriptor = Object.getOwnPropertyDescriptor(instance, 'url');

    expect(descriptor?.get).toBeUndefined();
    expect(descriptor?.set).toBeUndefined();
    expect(descriptor?.writable).toBe(true);

    (instance as any)['url'] = 'overwritten';
    expect(instance.getUrl()).toBe('overwritten');
  });
});
