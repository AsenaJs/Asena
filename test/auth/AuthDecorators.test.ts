import { describe, expect, test } from 'bun:test';
import {
  AUTH_GUARD_CLASS_KEY,
  AUTH_GUARD_METHODS_KEY,
  Protected,
  Public,
  Roles,
  collectGuardMetadata,
  effectiveGuardMark,
} from '../../lib/auth';
import type { GuardMark } from '../../lib/auth';
import { getOwnTypedMetadata } from '../../lib/utils/typedMetadata';

describe('guard mark recording', () => {
  test('class-level @Protected() records a protected class mark', () => {
    @Protected()
    class ProtectedController {}

    expect(collectGuardMetadata(ProtectedController).classMark).toEqual({ access: 'protected' });
  });

  test('method-level @Roles(a, b) records a protected method mark with the roles', () => {
    class RolesController {
      @Roles('a', 'b')
      handler() {}
    }

    expect(collectGuardMetadata(RolesController).methods.get('handler')).toEqual({
      access: 'protected',
      roles: ['a', 'b'],
    });
  });

  test('class-level @Roles(admin) implies a protected class mark', () => {
    @Roles('admin')
    class AdminController {}

    expect(collectGuardMetadata(AdminController).classMark).toEqual({
      access: 'protected',
      roles: ['admin'],
    });
  });

  test('@Public() on a method records exactly the public mark', () => {
    class PublicController {
      @Public()
      handler() {}
    }

    expect(collectGuardMetadata(PublicController).methods.get('handler')).toEqual({ access: 'public' });
  });

  test('@Protected({ provider }) records the provider, on the class and on a method', () => {
    @Protected({ provider: 'jwt' })
    class ClassProviderController {}

    expect(collectGuardMetadata(ClassProviderController).classMark).toEqual({
      access: 'protected',
      provider: 'jwt',
    });

    class MethodProviderController {
      @Protected({ provider: 'jwt' })
      handler() {}
    }

    expect(collectGuardMetadata(MethodProviderController).methods.get('handler')).toEqual({
      access: 'protected',
      provider: 'jwt',
    });
  });

  test('@Roles() with no roles throws at decoration time', () => {
    expect(() => {
      class BadController {
        @Roles()
        handler() {}
      }
    }).toThrow(/role/i);
  });

  test('two marks on the same method: the decorator applied last wins entirely', () => {
    // Legacy decorators run bottom-up: @Public() is applied first, @Roles('admin') second
    // and therefore replaces it - not merges with it.
    class StackedController {
      @Roles('admin')
      @Public()
      handler() {}
    }

    expect(collectGuardMetadata(StackedController).methods.get('handler')).toEqual({
      access: 'protected',
      roles: ['admin'],
    });

    class ReversedController {
      @Public()
      @Roles('admin')
      handler() {}
    }

    expect(collectGuardMetadata(ReversedController).methods.get('handler')).toEqual({ access: 'public' });
  });

  test('method decorators write a Map under AUTH_GUARD_METHODS_KEY on the constructor, never the prototype', () => {
    class ShapeController {
      @Public()
      handler() {}
    }

    const stored = getOwnTypedMetadata<Map<string, GuardMark>>(AUTH_GUARD_METHODS_KEY, ShapeController);

    expect(stored).toBeInstanceOf(Map);
    expect(stored?.get('handler')).toEqual({ access: 'public' });
    expect(getOwnTypedMetadata(AUTH_GUARD_METHODS_KEY, ShapeController.prototype)).toBeUndefined();
  });

  test('class decorators store the single GuardMark under AUTH_GUARD_CLASS_KEY', () => {
    @Protected()
    class MarkedController {}

    expect(getOwnTypedMetadata<GuardMark>(AUTH_GUARD_CLASS_KEY, MarkedController)).toEqual({
      access: 'protected',
    });
  });

  test('the method descriptor is untouched', () => {
    class PlainController {
      handler() {}
    }

    class GuardedController {
      @Public()
      handler() {
        return 'ok';
      }
    }

    const plain = Object.getOwnPropertyDescriptor(PlainController.prototype, 'handler')!;
    const guarded = Object.getOwnPropertyDescriptor(GuardedController.prototype, 'handler')!;

    expect(typeof guarded.value).toBe('function');
    expect(guarded.enumerable).toBe(plain.enumerable);
    expect(guarded.writable).toBe(plain.writable);
    expect(guarded.configurable).toBe(plain.configurable);
    expect(new GuardedController().handler()).toBe('ok');
  });
});

describe('guard mark inheritance (override semantics)', () => {
  test('a subclass class mark overrides the base class mark', () => {
    @Protected()
    class LockedController {}

    @Public()
    class OpenController extends LockedController {}

    expect(collectGuardMetadata(OpenController).classMark).toEqual({ access: 'public' });
  });

  test('a subclass method mark replaces the inherited one instead of merging', () => {
    class RolesBaseController {
      @Roles('admin')
      handler() {}
    }

    class OverrideController extends RolesBaseController {
      @Protected()
      handler() {}
    }

    expect(collectGuardMetadata(OverrideController).methods.get('handler')).toEqual({ access: 'protected' });
  });

  test('a subclass without marks inherits the base marks unchanged', () => {
    @Protected({ provider: 'jwt' })
    class MarkedBaseController {
      @Roles('admin')
      adminOnly() {}
    }

    class PlainSubController extends MarkedBaseController {}

    const collected = collectGuardMetadata(PlainSubController);

    expect(collected.classMark).toEqual({ access: 'protected', provider: 'jwt' });
    expect(collected.methods.get('adminOnly')).toEqual({ access: 'protected', roles: ['admin'] });
  });

  test('a grandchild sees the nearest class that declared a mark', () => {
    @Protected()
    class AController {}

    @Public()
    class BController extends AController {}

    class CController extends BController {}

    expect(collectGuardMetadata(CController).classMark).toEqual({ access: 'public' });
  });

  test('collectGuardMetadata hands back a fresh map, so callers cannot corrupt the stored marks', () => {
    class CorruptibleController {
      @Roles('admin')
      handler() {}
    }

    const first = collectGuardMetadata(CorruptibleController);

    first.methods.set('handler', { access: 'public' });

    expect(collectGuardMetadata(CorruptibleController).methods.get('handler')).toEqual({
      access: 'protected',
      roles: ['admin'],
    });
  });
});

describe('effectiveGuardMark', () => {
  test('the method mark wins over the class mark', () => {
    @Protected()
    class HostController {
      @Public()
      handler() {}
    }

    expect(effectiveGuardMark(collectGuardMetadata(HostController), 'handler')).toEqual({ access: 'public' });
  });

  test('falls back to the class mark for an unmarked method', () => {
    @Protected()
    class FallbackController {
      handler() {}
    }

    expect(effectiveGuardMark(collectGuardMetadata(FallbackController), 'handler')).toEqual({
      access: 'protected',
    });
  });

  test('returns undefined for an unmarked method on an unmarked class', () => {
    class BareController {
      handler() {}
    }

    expect(effectiveGuardMark(collectGuardMetadata(BareController), 'handler')).toBeUndefined();
  });

  test('a method-level @Protected() does not inherit roles from a @Roles class mark', () => {
    @Roles('admin')
    class RolesClassController {
      @Protected()
      handler() {}
    }

    expect(effectiveGuardMark(collectGuardMetadata(RolesClassController), 'handler')).toEqual({
      access: 'protected',
    });
  });
});
