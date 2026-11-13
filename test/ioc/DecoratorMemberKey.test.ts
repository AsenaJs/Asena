import { describe, expect, test } from 'bun:test';
import { Inject, OnStart, OnStop, Strategy, Value } from '../../lib/ioc/component';
import { ComponentConstants, type Dependencies, type Strategies } from '../../lib/ioc';
import { Override } from '../../lib/server/decorators';
import { getOwnTypedMetadata } from '../../lib/utils/typedMetadata';

describe('field decorators reject symbol-keyed members', () => {
  const memberKey = Symbol('member');

  test('@Inject throws for a symbol key and names the decorator', () => {
    class Holder {}
    expect(() => Inject('Dep')(Holder.prototype, memberKey)).toThrow(/@Inject supports string member names only/);
  });

  test('@Value throws for a symbol key and names the decorator', () => {
    class Holder {}
    expect(() => Value('ENV_KEY')(Holder.prototype, memberKey)).toThrow(/@Value supports string member names only/);
  });

  test('@Strategy throws for a symbol key and names the decorator', () => {
    class Holder {}
    expect(() => Strategy('Dep')(Holder.prototype, memberKey)).toThrow(/@Strategy supports string member names only/);
  });

  test('@Override accepts a symbol key, as it did before 0.13', () => {
    class Holder {}
    expect(() => Override()(Holder.prototype, memberKey)).not.toThrow();
  });

  test('the same decorators accept a string member name', () => {
    class Holder {}
    expect(() => Inject('Dep')(Holder.prototype, 'dep')).not.toThrow();
    expect(() => Value('ENV_KEY')(Holder.prototype, 'envValue')).not.toThrow();
    expect(() => Strategy('Dep')(Holder.prototype, 'strategy')).not.toThrow();
    expect(() => Override()(Holder.prototype, 'handle')).not.toThrow();
  });
});

describe('lifecycle decorators accept symbol-keyed members', () => {
  test('@OnStart and @OnStop record a symbol-keyed hook', () => {
    const boot = Symbol('boot');
    const halt = Symbol('halt');
    class Holder {}
    OnStart()(Holder.prototype, boot);
    OnStop()(Holder.prototype, halt);

    expect(getOwnTypedMetadata<(string | symbol)[]>(ComponentConstants.PostConstructKey, Holder)).toEqual([boot]);
    expect(getOwnTypedMetadata<(string | symbol)[]>(ComponentConstants.OnStopKey, Holder)).toEqual([halt]);
  });
});

describe('class-based injection of an undecorated class', () => {
  class PlainHelper {}

  test('@Inject records the class name', () => {
    class Holder {}
    Inject(PlainHelper)(Holder.prototype, 'helper');

    const dependencies = getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, Holder);

    expect(dependencies?.helper).toBe('PlainHelper');
  });

  test('@Strategy records the class name', () => {
    class Holder {}
    Strategy(PlainHelper)(Holder.prototype, 'strategy');

    const strategies = getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, Holder);

    expect(strategies?.strategy).toBe('PlainHelper');
  });
});
