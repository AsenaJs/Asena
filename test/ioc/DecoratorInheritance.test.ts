import { beforeEach, describe, expect, test } from 'bun:test';
import type { InjectableComponent } from '../../lib/ioc';
import type { Class } from '../../lib/server/types';
import { Container, IocEngine } from '../../lib/ioc';
import { Implements, Inject, PostConstruct, Strategy } from '../../lib/ioc/component';
import { Component, Service } from '../../lib/server/decorators';

// Inheritance is the documented way to share code across Asena projects: a base class
// ships in a package, the decorated subclass lives in the consuming service's src/ so the
// component scan can see it. These tests pin that contract per decorator family, because
// when it breaks it breaks silently - a dependency is undefined, a hook never runs - and
// nothing in the previous suites would have caught it.

@Service('LeafDependency')
class LeafDependency {
  public value = 'leaf';
}

@Service('OtherDependency')
class OtherDependency {
  public value = 'other';
}

describe('@Inject inheritance', () => {
  abstract class InjectGrandparent {
    @Inject(LeafDependency)
    protected fromGrandparent: LeafDependency;
  }

  abstract class InjectParent extends InjectGrandparent {
    @Inject(OtherDependency)
    protected fromParent: OtherDependency;
  }

  @Service('InjectChild')
  class InjectChild extends InjectParent {
    public read() {
      return [this.fromGrandparent?.value, this.fromParent?.value];
    }
  }

  @Service('InjectChildWithOwn')
  class InjectChildWithOwn extends InjectParent {
    @Inject(LeafDependency)
    private own: LeafDependency;

    public read() {
      return [this.fromGrandparent?.value, this.fromParent?.value, this.own?.value];
    }
  }

  let engine: IocEngine;

  beforeEach(() => {
    engine = new IocEngine();
    (engine as any)['_container'] = new Container();
  });

  const register = async (classes: Class[]) => {
    await engine.searchAndRegister(classes.map((Class) => ({ Class, interface: null }) as InjectableComponent));
  };

  test('injects fields declared two levels up the chain', async () => {
    await register([LeafDependency, OtherDependency, InjectChild]);

    const child = (await engine.container.resolve('InjectChild')) as InjectChild;

    expect(child.read()).toEqual(['leaf', 'other']);
  });

  test('a subclass declaring its own @Inject does not shadow inherited ones', async () => {
    await register([LeafDependency, OtherDependency, InjectChildWithOwn]);

    const child = (await engine.container.resolve('InjectChildWithOwn')) as InjectChildWithOwn;

    expect(child.read()).toEqual(['leaf', 'other', 'leaf']);
  });
});

describe('@PostConstruct inheritance', () => {
  const calls: string[] = [];

  abstract class HookGrandparent {
    @PostConstruct()
    protected async grandparentHook() {
      calls.push('grandparent');
    }
  }

  abstract class HookParent extends HookGrandparent {
    @PostConstruct()
    protected async parentHook() {
      calls.push('parent');
    }
  }

  @Service('HookChild')
  class HookChild extends HookParent {
    @PostConstruct()
    protected async childHook() {
      calls.push('child');
    }
  }

  @Service('HookOverrider')
  class HookOverrider extends HookParent {
    // Same method name as the parent's hook - it must run once, not twice.
    @PostConstruct()
    protected override async parentHook() {
      calls.push('overridden');
    }
  }

  let engine: IocEngine;

  beforeEach(() => {
    calls.length = 0;
    engine = new IocEngine();
    (engine as any)['_container'] = new Container();
  });

  const register = async (classes: Class[]) => {
    await engine.searchAndRegister(classes.map((Class) => ({ Class, interface: null }) as InjectableComponent));
  };

  test('runs hooks from every level of the chain', async () => {
    await register([HookChild]);
    await engine.container.resolve('HookChild');

    expect(calls.sort()).toEqual(['child', 'grandparent', 'parent']);
  });

  test('runs an overridden hook exactly once', async () => {
    await register([HookOverrider]);
    await engine.container.resolve('HookOverrider');

    expect(calls.filter((entry) => entry === 'overridden')).toHaveLength(1);
    expect(calls).not.toContain('parent');
  });
});

describe('@Strategy inheritance', () => {
  interface Greeter {
    greet(): string;
  }

  @Component()
  @Implements('Greeter')
  class EnglishGreeter implements Greeter {
    public greet() {
      return 'hello';
    }
  }

  @Component()
  @Implements('Greeter')
  class TurkishGreeter implements Greeter {
    public greet() {
      return 'merhaba';
    }
  }

  abstract class StrategyBase {
    @Strategy('Greeter')
    protected greeters: Greeter[];
  }

  @Service('StrategyChild')
  class StrategyChild extends StrategyBase {
    public all() {
      return this.greeters?.map((greeter) => greeter.greet());
    }
  }

  // The implementations come last on purpose: the engine has to learn from the *base*
  // class that StrategyChild needs 'Greeter' and order registration accordingly.
  // Without that the child resolves first and throws "Greeter is not registered".
  test('resolves a @Strategy field declared on a base class', async () => {
    const engine = new IocEngine();

    (engine as any)['_container'] = new Container();

    await engine.searchAndRegister([
      { Class: StrategyChild, interface: null },
      { Class: EnglishGreeter, interface: 'Greeter' },
      { Class: TurkishGreeter, interface: 'Greeter' },
    ] as InjectableComponent[]);

    const child = (await engine.container.resolve('StrategyChild')) as StrategyChild;

    expect(child.all()?.sort()).toEqual(['hello', 'merhaba']);
  });
});

describe('plain method inheritance', () => {
  abstract class MethodBase {
    public describe() {
      return 'from base';
    }
  }

  @Service('MethodChild')
  class MethodChild extends MethodBase {}

  test('a decorated subclass keeps its base class methods', async () => {
    const engine = new IocEngine();

    (engine as any)['_container'] = new Container();

    await engine.searchAndRegister([{ Class: MethodChild, interface: null }] as InjectableComponent[]);

    const child = (await engine.container.resolve('MethodChild')) as MethodChild;

    expect(child.describe()).toBe('from base');
  });
});

describe('decorators that replace the class they decorate', () => {
  // @asenajs/asena-drizzle's @Repository and @Database return a subclass of the target and
  // register it under the target's own name. getDependencies() treated the parent as a
  // dependency, so the component ended up depending on itself and the container reported a
  // circular dependency that does not exist.
  const Wrap =
    (name?: string) =>
    <T extends Class>(target: T): T => {
      @Service(name || target.name)
      class Wrapper extends (target as any) {}

      Object.defineProperty(Wrapper, 'name', { value: target.name, configurable: true });

      return Wrapper as unknown as T;
    };

  abstract class WrappedBase {
    public fromBase() {
      return 'base method';
    }
  }

  @Wrap()
  class WrappedDefaultName extends WrappedBase {}

  @Wrap('ExplicitName')
  class WrappedExplicitName extends WrappedBase {}

  const resolve = async (Class: Class, name: string) => {
    const engine = new IocEngine();

    (engine as any)['_container'] = new Container();

    await engine.searchAndRegister([{ Class, interface: null }] as InjectableComponent[]);

    return engine.container.resolve(name);
  };

  test('resolves when the wrapper is registered under the target class name', async () => {
    const instance: any = await resolve(WrappedDefaultName, 'WrappedDefaultName');

    expect(instance).toBeDefined();
    expect(instance.fromBase()).toBe('base method');
  });

  test('resolves when the wrapper is registered under an explicit name', async () => {
    const instance: any = await resolve(WrappedExplicitName, 'ExplicitName');

    expect(instance).toBeDefined();
    expect(instance.fromBase()).toBe('base method');
  });
});

// injectStrategies used to guard on the mere *existence* of an own property descriptor, while
// injectDependencies guards on its value. The asymmetry broke two ways: the chain runs
// ancestors-first, so a base class's accessor made the subclass's @Strategy override look
// "already set"; and under `useDefineForClassFields` (the default at ES2022+) an
// initializer-less field is an own property = undefined at construction, so nothing was
// injected at all. Bun's transpiler uses Set semantics, which is exactly why running from
// source hid the second case.
describe('@Strategy override precedence', () => {
  test('the subclass @Strategy wins over the base class one', async () => {
    @Implements('Quiet')
    @Service('QuietGreeter')
    class QuietGreeter {
      public volume = 'quiet';
    }

    @Implements('Loud')
    @Service('LoudGreeter')
    class LoudGreeter {
      public volume = 'loud';
    }

    abstract class GreeterBase {
      @Strategy('Quiet')
      public greeters: any[];
    }

    @Service('OverridingConsumer')
    class OverridingConsumer extends GreeterBase {
      @Strategy('Loud')
      public override greeters: any[];
    }

    const engine = new IocEngine();

    (engine as any)['_container'] = new Container();

    await engine.searchAndRegister([
      { Class: OverridingConsumer, interface: null },
      { Class: QuietGreeter, interface: 'Quiet' },
      { Class: LoudGreeter, interface: 'Loud' },
    ] as InjectableComponent[]);

    const consumer: any = await engine.container.resolve('OverridingConsumer');

    // A single implementation resolves to the instance rather than a one-element array
    const resolved = Array.isArray(consumer.greeters) ? consumer.greeters : [consumer.greeters];

    expect(resolved.map((g: any) => g.volume)).toEqual(['loud']);
  });

  test('an own property that is merely declared does not suppress injection', async () => {
    @Implements('Calm')
    @Service('CalmGreeter')
    class CalmGreeter {
      public volume = 'calm';
    }

    @Service('DefineSemanticsConsumer')
    class DefineSemanticsConsumer {
      @Strategy('Calm')
      public greeters: any[];
    }

    const engine = new IocEngine();

    (engine as any)['_container'] = new Container();

    await engine.searchAndRegister([
      { Class: DefineSemanticsConsumer, interface: null },
      { Class: CalmGreeter, interface: 'Calm' },
    ] as InjectableComponent[]);

    const container = engine.container;
    const instance = new DefineSemanticsConsumer();

    // Reproduce what `useDefineForClassFields` emits: an own property initialised to undefined,
    // created before the container gets to inject anything.
    Object.defineProperty(instance, 'greeters', { value: undefined, writable: true, configurable: true });

    await (container as any).injectStrategies(instance, DefineSemanticsConsumer);

    expect(instance.greeters).toBeDefined();

    const injected = Array.isArray(instance.greeters) ? instance.greeters : [instance.greeters];

    expect(injected.map((g: any) => g.volume)).toEqual(['calm']);
  });
});
