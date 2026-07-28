import { describe, expect, test } from 'bun:test';
import { Container, IocEngine } from '../../lib/ioc';
import { Component, Service } from '../../lib/server/decorators';
import { Implements, Inject, Strategy } from '../../lib/ioc/component';
import type { Class } from '../../lib/server/types';

/**
 * `@Strategy` is multi-valued by construction - that is the whole difference from `@Inject`.
 * It was correct at exactly one cardinality.
 *
 *   0 implementations -> `resolve()` threw "<key> is not registered" and the boot died
 *   1 implementation  -> the field got a BARE INSTANCE, not `[instance]`
 *   1 + expression    -> reading the field threw "strategy.map is not a function"
 *   2+ implementations-> correct
 *
 * One root cause. `Container.register()` stores a key's first registration as a bare
 * `ContainerService` and only converts to an array on the second, so `_services[key]` has three
 * shapes - undefined / object / array - which `resolve()` maps to throw / T / T[]. Right for
 * `@Inject`, whose dependency is single-valued and either present or the component is broken.
 * `resolveStrategy` was a cast over that same lookup (`as Promise<T[] | null>`), so it declared
 * `T[]` for all three.
 *
 * The 1-implementation case was the dangerous one: 0 died loudly at boot, 1 passed boot and
 * failed later at the first `.length` / `for...of` / `.map()`. Worse, the bug disappears as you
 * add implementations - write the registry (boot dies), add the first plugin (silently wrong),
 * add the second (suddenly works) - so it "fixes itself" and is never diagnosed.
 *
 * Why nothing caught it, in order of how much each contributed:
 *
 * 1. Both existing strategy tests use exactly TWO implementations (`Container.test.ts`,
 *    'should inject strategy' and 'should getStrategy components'). They pinned the only
 *    cardinality that worked - not covering the bug, but certifying an accuracy that did not
 *    exist.
 * 2. Every documented example uses two as well (`Website/docs/concepts/dependency-injection.md`,
 *    the `@Strategy` section). The feature is named for the plural case, so the singular and
 *    empty cases were in nobody's mental model - not the author's, not the reviewer's.
 * 3. The type system was silenced by hand. `resolveStrategy`'s cast declared all three shapes
 *    as `T[]`, and `injectStrategies` received it as `Class[]`. Nothing could warn.
 * 4. The layer above already tolerated zero. `getStrategyClass` (`helper/iocHelper.ts`) returns
 *    `[]` for a key nothing implements and the topological sort handles it fine - `Container`
 *    was the only layer that refused, so the refusal read like a deliberate strictness rule.
 * 5. The error message did not distinguish two causes. `"<key> is not registered"` is also what
 *    a component resolved before its implementations produces (see the recursion comment in
 *    `IocEngine.getStrategyDependencies`), so the trace pointed at an ordering bug.
 *
 * The gap was found by booting a real application, not by testing - which is why layer B here
 * drives a real `IocEngine`, and why a full `bun src/index.ts` boot was used to verify the fix.
 */

// --- Layer A fixtures: plain Container ------------------------------------------------------

interface Tool {
  name: string;
}

@Component()
class AlphaTool implements Tool {
  public name = 'alpha';
}

@Component()
class BetaTool implements Tool {
  public name = 'beta';
}

@Component()
class Consumer {
  @Strategy('ToolIface')
  public tools: Tool[];
}

@Component()
class ExprConsumer {
  @Strategy('ToolIface', (tool: Tool) => tool.name)
  public names: string[];
}

/** Registers `impls` under the strategy key, then both consumers. */
const containerWith = async (...impls: Class[]): Promise<Container> => {
  const container = new Container();

  for (const impl of impls) {
    await container.register('ToolIface', impl, true);
  }

  await container.register('Consumer', Consumer, true);
  await container.register('ExprConsumer', ExprConsumer, true);

  return container;
};

const consumerOf = async (container: Container): Promise<Consumer> => (await container.resolve('Consumer')) as Consumer;

const exprConsumerOf = async (container: Container): Promise<ExprConsumer> =>
  (await container.resolve('ExprConsumer')) as ExprConsumer;

describe('Container - @Strategy cardinality', () => {
  describe('0 implementations', () => {
    test('should inject an empty array instead of aborting the boot', async () => {
      // A plugin point with no plugins is the ordinary starting condition of one: the registry
      // is written first, implementations arrive per feature.
      const container = await containerWith();

      expect((await consumerOf(container)).tools).toEqual([]);
    });

    test('should inject an empty array through an expression too', async () => {
      const container = await containerWith();

      expect((await exprConsumerOf(container)).names).toEqual([]);
    });

    test('should resolve the key to [] rather than throwing', async () => {
      const container = await containerWith();

      expect(await container.resolveStrategy('ToolIface')).toEqual([]);
    });
  });

  describe('1 implementation', () => {
    test('should inject a one-element array, not the bare instance', async () => {
      // The silent half of the bug: boot passed and the field held an object, so the first
      // `.length` / `for...of` / `.map()` failed at runtime, far from the cause.
      const container = await containerWith(AlphaTool);

      const { tools } = await consumerOf(container);

      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toHaveLength(1);
      expect(tools[0]).toBeInstanceOf(AlphaTool);
    });

    test('should be iterable with one implementation', async () => {
      const container = await containerWith(AlphaTool);

      const collected: string[] = [];

      for (const tool of (await consumerOf(container)).tools) {
        collected.push(tool.name);
      }

      expect(collected).toEqual(['alpha']);
    });

    test('should apply the expression instead of throwing on property access', async () => {
      // Previously threw "strategy.map is not a function" from inside the injected getter -
      // a `.map()` the application never wrote.
      const container = await containerWith(AlphaTool);

      expect((await exprConsumerOf(container)).names).toEqual(['alpha']);
    });

    test('should resolve the key to a one-element array', async () => {
      const container = await containerWith(AlphaTool);

      expect(await container.resolveStrategy('ToolIface')).toHaveLength(1);
    });
  });

  describe('2 implementations', () => {
    test('should inject every implementation', async () => {
      const container = await containerWith(AlphaTool, BetaTool);

      expect((await consumerOf(container)).tools.map((tool) => tool.name)).toEqual(['alpha', 'beta']);
    });

    test('should apply the expression to every implementation', async () => {
      const container = await containerWith(AlphaTool, BetaTool);

      expect((await exprConsumerOf(container)).names).toEqual(['alpha', 'beta']);
    });

    test('should resolve the key to a two-element array', async () => {
      const container = await containerWith(AlphaTool, BetaTool);

      expect(await container.resolveStrategy('ToolIface')).toHaveLength(2);
    });
  });
});

// --- Circular detection ---------------------------------------------------------------------

@Component()
class SelfStrategy {
  @Strategy('SelfIface')
  public peers: SelfStrategy[];
}

describe('Container.resolveStrategy - circular detection', () => {
  test('should leave the resolution stack empty so the key can be resolved again', async () => {
    // resolveStrategy used to inherit push/pop from resolve(). A dedicated lookup that pushes
    // without popping would leave the key on the stack and report the SECOND call as a cycle.
    const container = await containerWith(AlphaTool);

    await container.resolveStrategy('ToolIface');
    await container.resolveStrategy('ToolIface');

    expect((container as any).circularDetector.isEmpty()).toBe(true);
  });

  test('should detect a cycle that runs through the strategy key itself', async () => {
    // Entered under the component name, so the strategy key is only ever pushed by
    // resolveStrategy. Without that push this recurses until the stack overflows.
    const container = new Container();

    await container.register('SelfStrategy', SelfStrategy, false);
    await container.register('SelfIface', SelfStrategy, false);

    expect(container.resolve('SelfStrategy')).rejects.toThrow(/Circular dependency detected/);
  });
});

// --- Overrides ------------------------------------------------------------------------------

describe('Container.overrideInstance on a strategy key', () => {
  test('should inject a single override as a one-element array', async () => {
    // overrideInstance always writes the bare-object shape, so mocking a strategy key in a
    // slice test produced the same cardinality-1 bug through the public testing API.
    const container = new Container();
    const double: Tool = { name: 'double' };

    container.overrideInstance('ToolIface', double);
    await container.register('Consumer', Consumer, true);

    expect((await consumerOf(container)).tools).toEqual([double]);
  });
});

// --- Layer B fixtures: real IocEngine registration -------------------------------------------

@Service()
@Implements('AgentTool')
class SearchTool implements Tool {
  public name = 'search';
}

@Service()
@Implements('AgentTool')
class CalcTool implements Tool {
  public name = 'calc';
}

/** A subclass of an implementation joins its base's key - @Implements is inherited as of 0.9.0. */
@Service()
class DerivedSearchTool extends SearchTool {
  public override name = 'derived';
}

@Service('ToolRegistry')
class ToolRegistry {
  @Strategy('AgentTool')
  public handlers: Tool[];
}

class StrategyBase {
  @Strategy('AgentTool')
  public inherited: Tool[];
}

@Service('DerivedRegistry')
class DerivedRegistry extends StrategyBase {}

const engineWith = () => {
  const engine = new IocEngine();
  const debugLines: string[] = [];

  (engine as any)['_container'] = new Container();
  (engine as any)['logger'] = {
    info: () => {},
    warn: () => {},
    error: () => {},
    profile: () => {},
    debug: (message: string) => debugLines.push(message),
  };

  return { engine, debugLines };
};

const registryFrom = async (engine: IocEngine, name = 'ToolRegistry'): Promise<any> =>
  await engine.container.resolve(name);

describe('IocEngine - @Strategy cardinality end to end', () => {
  test('should register a consumer whose strategy key has no implementations', async () => {
    const { engine } = engineWith();

    await engine.searchAndRegister([{ Class: ToolRegistry, interface: undefined }]);

    expect((await registryFrom(engine)).handlers).toEqual([]);
  });

  test('should inject a one-element array for a single implementation', async () => {
    const { engine } = engineWith();

    await engine.searchAndRegister([
      { Class: ToolRegistry, interface: undefined },
      { Class: SearchTool, interface: 'AgentTool' },
    ]);

    const { handlers } = await registryFrom(engine);

    expect(Array.isArray(handlers)).toBe(true);
    expect(handlers.map((handler: Tool) => handler.name)).toEqual(['search']);
  });

  test('should inject every implementation for two', async () => {
    const { engine } = engineWith();

    await engine.searchAndRegister([
      { Class: ToolRegistry, interface: undefined },
      { Class: SearchTool, interface: 'AgentTool' },
      { Class: CalcTool, interface: 'AgentTool' },
    ]);

    // Sorted: registration order is the topological sort's, not the argument list's
    expect((await registryFrom(engine)).handlers.map((handler: Tool) => handler.name).sort()).toEqual([
      'calc',
      'search',
    ]);
  });

  test('should inject [] for a @Strategy declared on a base class', async () => {
    const { engine } = engineWith();

    await engine.searchAndRegister([{ Class: DerivedRegistry, interface: undefined }]);

    expect((await registryFrom(engine, 'DerivedRegistry')).inherited).toEqual([]);
  });

  test('should count a subclass that inherits @Implements', async () => {
    const { engine } = engineWith();

    await engine.searchAndRegister([
      { Class: ToolRegistry, interface: undefined },
      { Class: DerivedSearchTool, interface: 'AgentTool' },
    ]);

    expect((await registryFrom(engine)).handlers.map((handler: Tool) => handler.name)).toEqual(['derived']);
  });
});

describe('IocEngine - empty strategy key diagnostic', () => {
  test('should report a strategy key that nothing implements', async () => {
    // The cost of the fix: an empty key is now silently `[]`, so a typo'd interface name fails
    // much later and much further from the cause. This line keeps the diagnosis.
    const { engine, debugLines } = engineWith();

    await engine.searchAndRegister([{ Class: ToolRegistry, interface: undefined }]);

    expect(debugLines.some((line) => line.includes('AgentTool') && line.includes('ToolRegistry'))).toBe(true);
  });

  test('should stay silent once the key has an implementation', async () => {
    const { engine, debugLines } = engineWith();

    await engine.searchAndRegister([
      { Class: ToolRegistry, interface: undefined },
      { Class: SearchTool, interface: 'AgentTool' },
    ]);

    expect(debugLines.filter((line) => line.includes('AgentTool'))).toHaveLength(0);
  });

  test('should stay silent when the key is supplied by an override', async () => {
    // A test double is a legitimate implementation - warning here would fire on every slice test.
    const { engine, debugLines } = engineWith();

    engine.container.overrideInstance('AgentTool', { name: 'double' });

    await engine.searchAndRegister([{ Class: ToolRegistry, interface: undefined }]);

    expect(debugLines.filter((line) => line.includes('AgentTool'))).toHaveLength(0);
  });

  test('should report a base class strategy key against the declaring class', async () => {
    const { engine, debugLines } = engineWith();

    await engine.searchAndRegister([{ Class: DerivedRegistry, interface: undefined }]);

    expect(debugLines.some((line) => line.includes('AgentTool'))).toBe(true);
  });
});

// --- Recorded, not endorsed -----------------------------------------------------------------

@Component()
class InjectConsumer {
  @Inject('ToolIface')
  public tool: Tool | Tool[];
}

describe('@Inject on a key with several implementations', () => {
  test('should inject an array - recorded, not endorsed', async () => {
    // The other end of the same root cause: `_services[key]` becomes an array on the second
    // registration and `resolve()` hands it straight to a single-valued field, whose declared
    // type (`Class | Class[]` in injectDependencies) admits it.
    //
    // Deliberately NOT changed here. Making @Inject throw on a multi-implementation key is the
    // defensible behaviour, but it is a breaking change for anyone relying on the array today,
    // and it belongs with its own migration note rather than inside a @Strategy bug fix.
    const container = new Container();

    await container.register('ToolIface', AlphaTool, true);
    await container.register('ToolIface', BetaTool, true);
    await container.register('InjectConsumer', InjectConsumer, true);

    const { tool } = (await container.resolve('InjectConsumer')) as InjectConsumer;

    expect(Array.isArray(tool)).toBe(true);
    expect(tool).toHaveLength(2);
  });
});
