import { describe, expect, test } from 'bun:test';
import { getStrategyClass } from '../../lib/ioc/helper/iocHelper';
import type { InjectableComponent } from '../../lib/ioc/types';

describe('getStrategyClass', () => {
  test('an unnamed implementation is listed under its class name, as IocEngine registers it', () => {
    class UnnamedStrategy {}
    const injectables: InjectableComponent[] = [{ Class: UnnamedStrategy, interface: 'Greeter' }];

    expect(getStrategyClass({ greeter: 'Greeter' }, injectables)).toEqual(['UnnamedStrategy']);
  });
});
