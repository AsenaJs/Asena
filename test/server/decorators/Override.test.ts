import { describe, expect, test } from 'bun:test';
import { Override } from '../../../lib/server/decorators';
import { ComponentConstants } from '../../../lib/ioc/constants';
import { getChainedTypedMetadataList, getOwnTypedMetadata, getTypedMetadata } from '../../../lib/utils/typedMetadata';

/**
 * `@Override` marks a middleware/validator/staticServe member as running raw, without Asena's
 * wrapper. It is a PropertyDecorator, so it writes to the *prototype*, and three prepare
 * services read it back off the resolved instance.
 *
 * Those reads used `getTypedMetadata`, which returns the nearest ancestor's array whole. Byte
 * for byte the same shadowing bug that hit @On and @MessagePattern: a subclass declaring one
 * `@Override` silently un-marked every inherited one, so a member that was supposed to run raw
 * got wrapped (or the reverse) with no error anywhere.
 */
describe('@Override inheritance', () => {
  test('accumulates several overrides on one class', () => {
    class Middleware {
      @Override()
      public handle!: () => void;

      @Override()
      public other!: () => void;
    }

    expect(getOwnTypedMetadata<string[]>(ComponentConstants.OverrideKey, Middleware.prototype)).toEqual([
      'handle',
      'other',
    ]);
  });

  test('a base class override survives when the subclass declares its own', () => {
    class Base {
      @Override()
      public handle!: () => void;
    }

    class Sub extends Base {
      @Override()
      public other!: () => void;
    }

    // The old read: nearest ancestor wins whole, so `handle` disappeared.
    expect(getTypedMetadata<string[]>(ComponentConstants.OverrideKey, new Sub())).toEqual(['other']);

    // The new one unions the chain.
    expect(getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, new Sub()).sort()).toEqual([
      'handle',
      'other',
    ]);
  });

  test('an inherited override is still seen when the subclass declares none', () => {
    class Base {
      @Override()
      public handle!: () => void;
    }

    class Sub extends Base {}

    expect(getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, new Sub())).toEqual(['handle']);
  });

  test('collects across three levels', () => {
    class Grandparent {
      @Override()
      public first!: () => void;
    }

    class Parent extends Grandparent {
      @Override()
      public second!: () => void;
    }

    class Leaf extends Parent {
      @Override()
      public third!: () => void;
    }

    expect(getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, new Leaf()).sort()).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  test('the same member marked at two levels is reported once', () => {
    class Base {
      @Override()
      public handle!: () => void;
    }

    class Sub extends Base {
      @Override()
      public override handle!: () => void;
    }

    expect(getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, new Sub())).toEqual(['handle']);
  });

  test('sibling subclasses do not see each other overrides', () => {
    class Shared {
      @Override()
      public shared!: () => void;
    }

    class First extends Shared {
      @Override()
      public onlyFirst!: () => void;
    }

    class Second extends Shared {}

    getChainedTypedMetadataList(ComponentConstants.OverrideKey, new First());

    expect(getChainedTypedMetadataList<string>(ComponentConstants.OverrideKey, new Second())).toEqual(['shared']);
  });

  test('a class with no overrides anywhere reports none', () => {
    class Plain {}

    expect(getChainedTypedMetadataList(ComponentConstants.OverrideKey, new Plain())).toEqual([]);
  });
});
