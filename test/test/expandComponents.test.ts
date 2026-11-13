import { describe, expect, test } from 'bun:test';
import { expandComponents } from '../../lib/test/harness/expandComponents';
import { Service } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';

describe('expandComponents', () => {
  test('a class-injected dependency named after its dependent is matched by its real name', () => {
    class Dependency {}

    class Dependent {
      @Inject(Dependency)
      public dependency!: Dependency;
    }

    // Named only after Dependent is decorated, so @Inject stored the class name instead.
    Service('RealDependency')(Dependency);

    expect(expandComponents([Dependent], { RealDependency: {} })).toEqual([Dependent]);
  });
});
