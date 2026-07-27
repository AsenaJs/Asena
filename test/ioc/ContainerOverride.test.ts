import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Container, IocEngine } from '../../lib/ioc';
import { Component } from '../../lib/server/decorators';
import { Implements, Inject, PostConstruct } from '../../lib/ioc/component';

const constructed: string[] = [];

@Component()
class UserService {
  public async findById(id: string) {
    return { id, real: true };
  }
}

@Component()
class TrackedService {
  public constructor() {
    constructed.push('TrackedService');
  }

  @PostConstruct()
  public async init() {
    constructed.push('TrackedService.init');
  }

  public value() {
    return 'real';
  }
}

@Component()
class ConsumerService {
  @Inject(UserService)
  public userService: UserService;

  public async load(id: string) {
    return await this.userService.findById(id);
  }
}

@Component({ name: 'PaymentGateway' })
@Implements('IPaymentGateway')
class StripeGateway {
  public charge() {
    return 'stripe';
  }
}

describe('Container.overrideInstance', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    constructed.length = 0;
  });

  test('should resolve the override instead of the real class', async () => {
    const double = { findById: mock(async () => ({ id: 'mock', real: false })) };

    container.overrideInstance('UserService', double);
    await container.register('UserService', UserService, true);

    expect(await container.resolve<typeof double>('UserService')).toBe(double);
  });

  test('should make later register() calls a no-op instead of building an array', async () => {
    const double = { value: () => 'double' };

    container.overrideInstance('TrackedService', double);
    await container.register('TrackedService', TrackedService, true);
    await container.register('TrackedService', TrackedService, true);

    const resolved = await container.resolve('TrackedService');

    expect(Array.isArray(resolved)).toBe(false);
    expect(resolved).toBe(double);
  });

  test('should never construct the real class or run its @PostConstruct', async () => {
    container.overrideInstance('TrackedService', { value: () => 'double' });
    await container.register('TrackedService', TrackedService, true);

    expect(constructed).toEqual([]);
  });

  test('should replace an already registered service', async () => {
    await container.register('TrackedService', TrackedService, true);
    expect(constructed).toEqual(['TrackedService', 'TrackedService.init']);

    const double = { value: () => 'double' };

    container.overrideInstance('TrackedService', double);

    expect(await container.resolve<typeof double>('TrackedService')).toBe(double);
  });

  test('should be captured by dependents registered afterwards', async () => {
    const double = { findById: mock(async () => ({ id: 'mock', real: false })) };

    // Injection closures are built eagerly at register time, so the override has to be
    // seeded before the dependent is registered - this is what the harness relies on
    container.overrideInstance('UserService', double);
    await container.register('UserService', UserService, true);
    await container.register('ConsumerService', ConsumerService, true);

    const consumer = (await container.resolve('ConsumerService')) as ConsumerService;

    expect(consumer.userService).toBe(double);
    expect(await consumer.load('1')).toEqual({ id: 'mock', real: false });
    expect(double.findById).toHaveBeenCalledWith('1');
  });

  test('should reject null and undefined overrides', () => {
    expect(() => container.overrideInstance('UserService', null)).toThrow(/must be an object instance/);
    expect(() => container.overrideInstance('UserService', undefined)).toThrow(/must be an object instance/);
  });

  test('should report overridden keys via isOverridden', () => {
    expect(container.isOverridden('UserService')).toBe(false);

    container.overrideInstance('UserService', { findById: mock(async () => null) });

    expect(container.isOverridden('UserService')).toBe(true);
    expect(container.isOverridden('OtherService')).toBe(false);
  });
});

describe('IocEngine registration with overrides', () => {
  test('should not re-register an overridden component under its @Implements interface', async () => {
    const iocEngine = new IocEngine();

    // IocEngine is a core service - its container normally arrives via DI
    (iocEngine as any)['_container'] = new Container();
    const double = { charge: () => 'double' };

    iocEngine.container.overrideInstance('PaymentGateway', double);

    await iocEngine.searchAndRegister([{ Class: StripeGateway, interface: 'IPaymentGateway' }]);

    expect(await iocEngine.container.resolve<typeof double>('PaymentGateway')).toBe(double);
    // Registering under the interface key would have constructed the real class anyway
    expect(iocEngine.container.has('IPaymentGateway')).toBe(false);
  });

  test('should still register the interface key when the component is not overridden', async () => {
    const iocEngine = new IocEngine();

    // IocEngine is a core service - its container normally arrives via DI
    (iocEngine as any)['_container'] = new Container();

    await iocEngine.searchAndRegister([{ Class: StripeGateway, interface: 'IPaymentGateway' }]);

    expect(iocEngine.container.has('IPaymentGateway')).toBe(true);
    const gateway = await iocEngine.container.resolve<StripeGateway>('IPaymentGateway');

    // resolve() is typed `T | T[] | null`; narrow instead of casting (see FactoryOverrides).
    if (gateway === null || Array.isArray(gateway)) throw new Error('expected a single StripeGateway instance');

    expect(gateway.charge()).toBe('stripe');
  });
});
