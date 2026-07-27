import { describe, expect, test } from 'bun:test';
import { Container, IocEngine } from '../../lib/ioc';
import { Inject } from '../../lib/ioc/component';
import { Middleware, Service } from '../../lib/server/decorators';
import { AsenaMiddlewareService } from '../../lib/server/web/middleware';

/**
 * A component name is an identity, so two classes claiming one is a conflict.
 *
 * It used to be a warning, and the resolution was silent and arbitrary. `dedupeInjectables`
 * deduped by *class identity* and pushed both classes through; `initializeGraph` then keyed them
 * by name in a `Map`, so whichever came last in scan order overwrote the other and only the
 * winner was ever registered. A route naming the loser ran the winner's handler, and
 * `@Inject(Loser)` returned an instance of the winner - the same failure `Duplicate route
 * detected` exists to prevent, one layer down.
 *
 * Nothing caught it, for four compounding reasons worth recording:
 *
 * 1. No test ever created two same-named components. Not one.
 * 2. The warning made it *look* handled. `Only one of them will be registered` is accurate, so
 *    the code reads like a deliberate design decision rather than a hole.
 * 3. A test asserting "a warning is emitted" would have passed while the swap happened, because
 *    the warning never said *which* class won.
 * 4. The explicit `components: [...]` path never called `dedupeInjectables` at all - and that is
 *    the path `createTestApp`/`createWebTest` use, so a slice test could wire the wrong class and
 *    stay green with no signal whatsoever.
 *
 * It is only observable if you inject the loser *and* the winner behaves differently. Two
 * similar classes swap invisibly.
 */

const engineWith = () => {
  const engine = new IocEngine();
  const warnings: string[] = [];

  (engine as any)['_container'] = new Container();
  (engine as any)['logger'] = {
    info: () => {},
    warn: (message: string) => warnings.push(message),
    error: () => {},
    profile: () => {},
  };

  return { engine, warnings };
};

/** Drives the explicit `components: [...]` branch of loadComponents. */
const loadExplicit = async (classes: any[]) => {
  const { engine, warnings } = engineWith();

  await (engine as any)['loadComponents'](classes.map((Class) => ({ Class, interface: null })));

  return { engine, warnings, injectables: (engine as any)['injectables'] };
};

/** Drives dedupeInjectables the way the filesystem scan reaches it. */
const dedupeAsScanDoes = (classes: any[]) => {
  const { engine } = engineWith();

  return (engine as any)['dedupeInjectables'](classes.map((Class) => ({ Class, interface: null })));
};

describe('duplicate component names', () => {
  test('two classes claiming one name are rejected, naming both', () => {
    @Service('SharedName')
    class AlphaService {
      public who() {
        return 'alpha';
      }
    }

    @Service('SharedName')
    class BetaService {
      public who() {
        return 'beta';
      }
    }

    expect(() => dedupeAsScanDoes([AlphaService, BetaService])).toThrow(
      /Duplicate component name detected: 'SharedName'/,
    );

    // Naming both is the whole point: with a silent Map overwrite the loser is invisible, and
    // the surviving class is decided by scan order rather than by anything the author wrote.
    const error = (() => {
      try {
        dedupeAsScanDoes([AlphaService, BetaService]);
      } catch (thrown) {
        return thrown as Error;
      }
    })();

    expect(error!.message).toContain('AlphaService');
    expect(error!.message).toContain('BetaService');
  });

  test('the explicit components: [...] path rejects them too', async () => {
    @Service('ExplicitDupe')
    class FirstService {}

    @Service('ExplicitDupe')
    class SecondService {}

    // This path used to skip dedupeInjectables entirely - no throw, and not even a warning.
    // It is the path createTestApp/createWebTest use, so the swap was completely silent there.
    await expect(loadExplicit([FirstService, SecondService])).rejects.toThrow(
      /Duplicate component name detected: 'ExplicitDupe'/,
    );
  });

  test('classes produced by a factory collide on their inferred name', () => {
    // The realistic shape. A parameterised guard factory yields two classes that are different
    // objects with different behaviour and the *same* inferred name, so nothing in the source
    // looks duplicated.
    const makeGuard = (token: string) => {
      @Middleware()
      class FactoryGuard extends AsenaMiddlewareService {
        public handle() {
          return token;
        }
      }

      return FactoryGuard;
    };

    const TokenAGuard = makeGuard('A');
    const TokenBGuard = makeGuard('B');

    expect(TokenAGuard).not.toBe(TokenBGuard);
    expect(() => dedupeAsScanDoes([TokenAGuard, TokenBGuard])).toThrow(
      /Duplicate component name detected: 'FactoryGuard'/,
    );
  });

  test('an explicit name disambiguates, and both components survive', () => {
    @Service('DistinctOne')
    class OneService {}

    @Service('DistinctTwo')
    class TwoService {}

    const kept = dedupeAsScanDoes([OneService, TwoService]);

    expect(kept).toHaveLength(2);
    expect(kept.map((entry: any) => entry.Class)).toEqual([OneService, TwoService]);
  });

  test('the same class listed twice is still deduped, not rejected', () => {
    @Service('ListedTwice')
    class RepeatedService {}

    // Identity-based dedupe predates this check and must survive it: a class reachable from two
    // barrels is one component, not a conflict.
    const kept = dedupeAsScanDoes([RepeatedService, RepeatedService]);

    expect(kept).toHaveLength(1);
    expect(kept[0].Class).toBe(RepeatedService);
  });

  test('a class that is not a component cannot collide with one', async () => {
    @Service('OnlyRealComponent')
    class RealService {}

    // Undecorated, and named the same. It is filtered out before the name check, so it must not
    // turn a healthy application into a boot failure.
    class OnlyRealComponent {}

    const { injectables } = await loadExplicit([RealService, OnlyRealComponent]);

    expect(injectables).toHaveLength(1);
    expect(injectables[0].Class).toBe(RealService);
  });

  test('the loser used to be silently swapped for the winner', () => {
    // Documents the behaviour the throw replaces, so the cost of relaxing it back to a warning
    // is visible: `@Inject(AuthGuardA)` resolved the name both classes share and received
    // whichever one `initializeGraph` happened to key last.
    @Service('SwapProbe')
    class ProbeA {
      public who() {
        return 'A';
      }
    }

    @Service('SwapProbe')
    class ProbeB {
      public who() {
        return 'B';
      }
    }

    @Service()
    class Consumer {
      @Inject(ProbeA)
      public probe: ProbeA;
    }

    expect(() => dedupeAsScanDoes([ProbeA, ProbeB, Consumer])).toThrow(/Duplicate component name detected/);
  });
});
