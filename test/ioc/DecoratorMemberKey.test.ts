import { describe, expect, test } from 'bun:test';
import { Inject, OnStart, OnStop, Strategy, Value } from '../../lib/ioc/component';
import { ComponentConstants, type Dependencies, type Strategies } from '../../lib/ioc';
import { Override } from '../../lib/server/decorators';
import { getOwnTypedMetadata } from '../../lib/utils/typedMetadata';

// Metadata is keyed by member name. A symbol-keyed member used to be stored under a
// symbol that the container never reads, so the decorator did nothing without a word.
describe('field decorators reject symbol-keyed members', () => {
  const memberKey = Symbol('member');

  test('@Inject throws for a symbol key', () => {
    class Holder {}
    expect(() => Inject('Dep')(Holder.prototype, memberKey)).toThrow(TypeError);
  });

  test('@Value throws for a symbol key', () => {
    class Holder {}
    expect(() => Value('ENV_KEY')(Holder.prototype, memberKey)).toThrow(TypeError);
  });

  test('@Strategy throws for a symbol key', () => {
    class Holder {}
    expect(() => Strategy('Dep')(Holder.prototype, memberKey)).toThrow(TypeError);
  });

  test('@OnStart throws for a symbol key', () => {
    class Holder {}
    expect(() => OnStart()(Holder.prototype, memberKey)).toThrow(TypeError);
  });

  test('@OnStop throws for a symbol key', () => {
    class Holder {}
    expect(() => OnStop()(Holder.prototype, memberKey)).toThrow(TypeError);
  });

  test('@Override throws for a symbol key', () => {
    class Holder {}
    expect(() => Override()(Holder.prototype, memberKey)).toThrow(TypeError);
  });

  test('the same decorators accept a string member name', () => {
    class Holder {}
    expect(() => Inject('Dep')(Holder.prototype, 'dep')).not.toThrow();
    expect(() => Value('ENV_KEY')(Holder.prototype, 'envValue')).not.toThrow();
    expect(() => Strategy('Dep')(Holder.prototype, 'strategy')).not.toThrow();
    expect(() => OnStart()(Holder.prototype, 'boot')).not.toThrow();
    expect(() => OnStop()(Holder.prototype, 'halt')).not.toThrow();
    expect(() => Override()(Holder.prototype, 'handle')).not.toThrow();
  });
});

// Injecting a class that was never decorated as a component used to store `undefined`
// as the dependency name. The name now falls back to the class name, as IocEngine does.
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
