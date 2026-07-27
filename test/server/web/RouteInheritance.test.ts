import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AsenaServer } from '../../../lib/server';
import { AsenaServerFactory } from '../../../lib/server';
import { Controller, Middleware, Service } from '../../../lib/server/decorators';
import { All, Get, Post } from '../../../lib/server/web/decorators';
import { Inject } from '../../../lib/ioc/component';
import { AsenaMiddlewareService } from '../../../lib/server/web/middleware';
import type { AsenaContext, RouteParams } from '../../../lib/adapter';
import { HttpMethod } from '../../../lib/server/web/types';

// Routes declared on a base class used to vanish: the @Get decorator writes its metadata to
// the class declaring the method, and AsenaServer read own metadata off the subclass, so the
// two never met. Nothing failed - the route simply did not exist.
//
// The contract now matches Spring and JAX-RS: the whole prototype chain is merged, a subclass
// overrides an inherited route *by method name*, and two different methods landing on the
// same path is a conflict that throws at startup.

@Service('GreetingService')
class GreetingService {
  public greet() {
    return 'hello';
  }
}

// PrepareMiddlewareService hands the adapter a plain `{ handle, override }` object, so the
// middleware class is not recoverable from the value itself - the only honest way to identify
// one is to call it. Hence the tag.
const middlewareCalls: string[] = [];

@Middleware()
class BaseRouteMiddleware extends AsenaMiddlewareService {
  public handle() {
    middlewareCalls.push('BaseRouteMiddleware');
  }
}

@Middleware()
class TopLevelMiddleware extends AsenaMiddlewareService {
  public handle() {
    middlewareCalls.push('TopLevelMiddleware');
  }
}

abstract class HealthBase {
  @Get('/live')
  public live(context: AsenaContext<any, any>) {
    return context.send({ probe: 'live' });
  }
}

abstract class ProbeBase extends HealthBase {
  @Get('/ready')
  public ready(context: AsenaContext<any, any>) {
    return context.send({ probe: 'ready' });
  }
}

@Controller('/only-inherited')
class OnlyInheritedController extends HealthBase {}

@Controller('/three-levels')
class ThreeLevelController extends ProbeBase {
  @Get('/own')
  public own(context: AsenaContext<any, any>) {
    return context.send({ probe: 'own' });
  }
}

abstract class DepthOne {
  @Get('/one')
  public one(context: AsenaContext<any, any>) {
    return context.send({ depth: 1 });
  }
}

abstract class DepthTwo extends DepthOne {
  @Get('/two')
  public two(context: AsenaContext<any, any>) {
    return context.send({ depth: 2 });
  }
}

abstract class DepthThree extends DepthTwo {
  @Get('/three')
  public three(context: AsenaContext<any, any>) {
    return context.send({ depth: 3 });
  }
}

@Controller('/depth')
class DepthLeafController extends DepthThree {
  @Get('/four')
  public four(context: AsenaContext<any, any>) {
    return context.send({ depth: 4 });
  }
}

abstract class OverridableBase {
  @Get('/value')
  public value(context: AsenaContext<any, any>) {
    return context.send({ from: 'base' });
  }
}

@Controller('/override')
class OverridingController extends OverridableBase {
  @Get('/value')
  public override value(context: AsenaContext<any, any>) {
    return context.send({ from: 'subclass' });
  }
}

@Controller('/conflict')
class ConflictingController extends OverridableBase {
  // Different method name, same path as the inherited OverridableBase.value
  @Get('/value')
  public alsoValue(context: AsenaContext<any, any>) {
    return context.send({ from: 'conflict' });
  }
}

abstract class MiddlewareCarryingBase {
  @Post({ path: '/guarded', middlewares: [BaseRouteMiddleware] })
  public guarded(context: AsenaContext<any, any>) {
    return context.send({ ok: true });
  }
}

@Controller({ path: '/carrier', middlewares: [TopLevelMiddleware] })
class MiddlewareCarryingController extends MiddlewareCarryingBase {}

@Controller('/first')
class FirstSibling extends HealthBase {
  // Own route on purpose: contamination is a *write* into the shared base's record, so two
  // empty subclasses cannot detect it however the merge is implemented.
  @Get('/only-first')
  public onlyFirst(context: AsenaContext<any, any>) {
    return context.send({ sibling: 'first' });
  }
}

@Controller('/second')
class SecondSibling extends HealthBase {}

@Controller('/same')
class FirstSamePrefix extends HealthBase {}

@Controller('/same')
class SecondSamePrefix extends HealthBase {}

@Controller({ path: '/base-prefix', middlewares: [TopLevelMiddleware] })
abstract class DecoratedBase {
  @Get('/thing')
  public thing(context: AsenaContext<any, any>) {
    return context.send({ ok: true });
  }
}

@Controller('/subclass-prefix')
class SubclassPrefixController extends DecoratedBase {}

abstract class InjectingBase {
  @Inject(GreetingService)
  protected greetingService: GreetingService;

  @Get('/greeting')
  public greeting(context: AsenaContext<any, any>) {
    return context.send({ greeting: this.greetingService.greet() });
  }
}

@Controller('/injecting')
class InjectingController extends InjectingBase {}

abstract class SilentOverrideBase {
  @Get('/inherited')
  public handle(context: AsenaContext<any, any>) {
    return context.send({ from: 'base' });
  }
}

@Controller('/silent-override')
class SilentOverrideController extends SilentOverrideBase {
  // No decorator here. The metadata comes from the base, the function from this class - the
  // shape people actually write, and the one JAX-RS 3.6 spells out.
  public override handle(context: AsenaContext<any, any>) {
    return context.send({ from: 'subclass' });
  }
}

abstract class CatchAllBase {
  @All('/thing')
  public everything(context: AsenaContext<any, any>) {
    return context.send({ from: 'all' });
  }
}

@Controller('/catch-all')
class CatchAllConflictController extends CatchAllBase {
  @Get('/thing')
  public justGet(context: AsenaContext<any, any>) {
    return context.send({ from: 'get' });
  }
}

abstract class ParamRouteBase {
  @Get('/:id')
  public byId(context: AsenaContext<any, any>) {
    return context.send({ by: 'id' });
  }
}

@Controller('/users')
class OrderedRouteController extends ParamRouteBase {
  @Get('/me')
  public me(context: AsenaContext<any, any>) {
    return context.send({ by: 'me' });
  }
}

@Controller('/plain')
class PlainController {
  @Get('/one')
  public one(context: AsenaContext<any, any>) {
    return context.send({ n: 1 });
  }

  @Get('/two')
  public two(context: AsenaContext<any, any>) {
    return context.send({ n: 2 });
  }
}

describe('route inheritance', () => {
  let registered: RouteParams<AsenaContext<any, any>, any>[];
  let mockLogger: any;
  let mockAdapter: any;

  beforeEach(() => {
    registered = [];

    mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      profile: mock(() => {}),
    };

    mockAdapter = {
      name: 'MockAdapter',
      options: {},
      setPort: mock(() => {}),
      start: mock(async () => {}),
      registerRoute: mock((params: RouteParams<AsenaContext<any, any>, any>) => {
        registered.push(params);
      }),
      registerWebsocketRoute: mock(() => {}),
      prepareMiddlewares: mock(() => []),
      prepareHandler: mock(() => () => {}),
      prepareValidator: mock(() => {}),
      use: mock(() => {}),
      serveOptions: mock(async () => {}),
      onError: mock(() => {}),
      websocketAdapter: {
        registerWebSocket: mock(() => {}),
        startWebsocket: mock(() => {}),
      },
    };
  });

  const boot = async (components: any[]): Promise<AsenaServer<any>> => {
    const server = await AsenaServerFactory.create({
      adapter: mockAdapter,
      logger: mockLogger,
      port: 3000,
      components,
    });

    await server.start();

    return server;
  };

  const paths = () => registered.map((route) => `${route.method} ${route.path}`).sort();

  /** Identifies a prepared middleware by invoking it - see the note beside the fixtures. */
  const identify = (prepared: any): string => {
    middlewareCalls.length = 0;
    prepared.handle();

    return middlewareCalls[0];
  };

  test('registers a route declared only on the base class', async () => {
    await boot([OnlyInheritedController]);

    expect(paths()).toEqual(['get /only-inherited/live']);
  });

  test('registers inherited and own routes together', async () => {
    await boot([ThreeLevelController]);

    expect(paths()).toEqual(['get /three-levels/live', 'get /three-levels/own', 'get /three-levels/ready']);
  });

  test('walks four levels, every one of which declares a route', async () => {
    await boot([DepthLeafController]);

    // Its own fixture rather than an assertion about the 3-level boot above: a subset check on
    // a set another test already pins in full cannot fail on its own.
    expect(paths()).toEqual(['get /depth/four', 'get /depth/one', 'get /depth/three', 'get /depth/two']);
  });

  test('a subclass method with the same name overrides the inherited route', async () => {
    await boot([OverridingController]);

    expect(paths()).toEqual(['get /override/value']);

    const send = mock((data: any) => data);

    await registered[0].handler({ send } as any);

    expect(send).toHaveBeenCalledWith({ from: 'subclass' });
  });

  test('two different methods on the same path throw at startup', async () => {
    // The conflicting method lives in a file the user is not looking at, so the tail of this
    // message - which pair of methods collided - is the only way to find it.
    await expect(boot([ConflictingController])).rejects.toThrow(/Duplicate route detected.*value\(\).*alsoValue\(\)/s);
  });

  test('an inherited route keeps its own route-level middlewares', async () => {
    await boot([MiddlewareCarryingController, BaseRouteMiddleware, TopLevelMiddleware]);

    const guarded = registered.find((route) => route.path === '/carrier/guarded');

    // The middleware is declared next to the @Post on the base class, so losing it would be
    // an authorization hole rather than a missing route.
    expect(guarded).toBeDefined();
    expect(guarded.method).toBe(HttpMethod.POST);
    // Identity, not just count: a swap - the controller-level middleware landing in the route
    // slot instead of the route's own - also reads as length 1 and is an authorization hole.
    expect(guarded.middlewares).toHaveLength(1);
    expect(identify(guarded.middlewares[0])).toBe('BaseRouteMiddleware');

    // ...and the controller-level one went through adapter.use, scoped to this controller
    const [middleware, config] = mockAdapter.use.mock.calls.at(-1);

    expect(identify(middleware)).toBe('TopLevelMiddleware');
    expect(config).toEqual({ include: ['/carrier/*'] });
  });

  test('two controllers extending one base do not contaminate each other', async () => {
    await boot([FirstSibling, SecondSibling]);

    // FirstSibling declares a route of its own; if the merge wrote back into HealthBase's
    // stored record, `/second/only-first` would appear here too.
    expect(paths()).toEqual(['get /first/live', 'get /first/only-first', 'get /second/live']);
  });

  test('two controllers extending one base at the same prefix throw', async () => {
    await expect(boot([FirstSamePrefix, SecondSamePrefix])).rejects.toThrow(/Duplicate route detected/);
  });

  test("the subclass's @Controller prefix wins over the base's", async () => {
    await boot([SubclassPrefixController, TopLevelMiddleware]);

    expect(paths()).toEqual(['get /subclass-prefix/thing']);
  });

  // The regression that route merging introduced. @Controller writes MiddlewaresKey
  // unconditionally - an empty array when none are declared - so reading it own-only let a
  // subclass shadow its base's guards while still inheriting the base's routes. The route
  // registered; the guard did not. Before merging, that route did not exist at all, so this is
  // strictly worse than the bug it replaced: a reachable endpoint with its auth quietly gone.
  test("a subclass inherits its base's controller-level middlewares", async () => {
    await boot([SubclassPrefixController, TopLevelMiddleware]);

    expect(mockAdapter.use).toHaveBeenCalledTimes(1);

    const [middleware, config] = mockAdapter.use.mock.calls[0];

    expect(identify(middleware)).toBe('TopLevelMiddleware');
    // Scoped to the subclass's own prefix, not the base's
    expect(config).toEqual({ include: ['/subclass-prefix/*'] });
  });

  test('a subclass may add middlewares on top of the inherited ones', async () => {
    @Controller({ path: '/adds', middlewares: [BaseRouteMiddleware] })
    class AddingController extends DecoratedBase {}

    await boot([AddingController, TopLevelMiddleware, BaseRouteMiddleware]);

    const applied = mockAdapter.use.mock.calls.map(([middleware]: any[]) => identify(middleware));

    // Ancestors first, then its own - and the inherited one is not dropped
    expect(applied).toEqual(['TopLevelMiddleware', 'BaseRouteMiddleware']);
  });

  test('an inherited handler runs against the subclass instance', async () => {
    await boot([InjectingController, GreetingService]);

    const send = mock((data: any) => data);

    await registered[0].handler({ send } as any);

    // The handler body lives on the base class but `this` must be the resolved subclass,
    // with its injected dependencies in place.
    expect(send).toHaveBeenCalledWith({ greeting: 'hello' });
  });

  test('an inherited route registers before the subclass own routes', async () => {
    await boot([OrderedRouteController]);

    // getChainedTypedMetadata merges ancestors first, so /users/:id (inherited) is registered
    // before /users/me (own). Ergenecore hands Bun a specificity-matched routes object and does
    // not care, but Hono matches in registration order - pinning this makes any future reorder
    // a deliberate decision rather than a silent 200 with the wrong payload.
    expect(registered.map((route) => route.path)).toEqual(['/users/:id', '/users/me']);
  });

  test('an @All on the base conflicts with a @Get on the subclass', async () => {
    // checkDuplicateRoute has two dedicated ALL branches that inheritance never reached before.
    await expect(boot([CatchAllConflictController])).rejects.toThrow(/Duplicate route detected/);
  });

  test('an override without re-applying the decorator still uses the subclass body', async () => {
    await boot([SilentOverrideController]);

    expect(paths()).toEqual(['get /silent-override/inherited']);

    const send = mock((data: any) => data);

    await registered[0].handler({ send } as any);

    // Metadata from the base, function from the subclass. This is what people actually write,
    // and what JAX-RS 3.6 specifies - every other override test here re-decorates instead.
    expect(send).toHaveBeenCalledWith({ from: 'subclass' });
  });

  test('an inherited route carries its validator into registration', async () => {
    @Middleware({ validator: true })
    class InheritedValidator {
      public json() {
        return { parse: (value: unknown) => value };
      }
    }

    abstract class ValidatedBase {
      @Post({ path: '/submit', validator: InheritedValidator })
      public submit(context: AsenaContext<any, any>) {
        return context.send({ ok: true });
      }
    }

    @Controller('/validated')
    class ValidatedController extends ValidatedBase {}

    await boot([ValidatedController, InheritedValidator]);

    // Validators are resolved by PrepareValidatorService, not the adapter - it throws
    // "Validator not found" if the class never reached the container. Reaching registration
    // with a resolved validator attached is the proof.
    expect(registered).toHaveLength(1);
    expect(registered[0].validator).toBeDefined();
    expect(typeof (registered[0].validator as any).json?.handle).toBe('function');
  });

  test('a controller without a base class is unaffected', async () => {
    await boot([PlainController]);

    expect(paths()).toEqual(['get /plain/one', 'get /plain/two']);
  });

  // Mixins are the documented way to share controller behaviour, but TypeScript rejects a
  // decorator inside a class *expression* (TS1206) and Bun's transpiler drops it without a
  // word - so `(Base) => class extends Base { @Get('/x') … }` registers nothing at all. The
  // shape that works is a named class *declaration* returned from a factory, and that is the
  // one worth pinning: it is an ordinary anonymous-free link in the chain, and it only
  // resolves because the route read walks it.
  test('collects routes from a class declared inside a factory function', async () => {
    const withHealth = (Base: any) => {
      class HealthMixin extends Base {
        @Get('/live')
        public live(context: AsenaContext<any, any>) {
          return context.send({ probe: 'live' });
        }
      }

      return HealthMixin;
    };

    class MixinRoot {}

    @Controller('/factory')
    class FactoryController extends withHealth(MixinRoot) {
      @Get('/own')
      public own(context: AsenaContext<any, any>) {
        return context.send({ probe: 'own' });
      }
    }

    await boot([FactoryController]);

    expect(paths()).toEqual(['get /factory/live', 'get /factory/own']);
  });

  test('logs which routes were inherited, and stays quiet when none are', async () => {
    await boot([ThreeLevelController]);

    const inheritedLog = mockLogger.info.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('inherits routes'));

    expect(inheritedLog).toContain('live');
    expect(inheritedLog).toContain('ready');
    expect(inheritedLog).not.toContain('own');
  });

  test('does not log inheritance for a controller that declares everything itself', async () => {
    await boot([PlainController]);

    const inheritedLog = mockLogger.info.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('inherits routes'));

    expect(inheritedLog).toBeUndefined();
  });

  /**
   * Component identity is own-only, so an undecorated subclass of a @Middleware is not a
   * component. `PrepareMiddlewareService` used to resolve the class by
   * `getTypedMetadata(NameKey, …)`, which walks the chain - so it found the *base's* name and
   * handed the route the base's instance. The guard the author wrote never ran and the one it
   * was meant to replace ran in its place.
   *
   * Before 0.9.0 the subclass was registered under the base's name, the container promoted the
   * entry to an array, and the route ran both. That was wrong too, but it was visible. The
   * regression was strictly worse: a weaker guard, silently, with the class the developer
   * referenced nowhere in the picture, and nothing warned when the subclass was not also in the
   * component list. Both services now read the name own-only and throw when it is missing.
   *
   * These two tests are deliberately not satisfied by the rejection alone. `rejects.toThrow`
   * reports "expected a rejection" and stops, which cannot tell "registered nothing" apart from
   * "registered the weaker guard" - the same blind spot that let the regression through. When
   * the boot wrongly succeeds they resolve the route and name the guard that actually got it.
   *
   * `ergenecore/test/undecoratedGuard.test.ts` and its hono twin cover the same three positions
   * through a real server and a real request.
   */
  describe('undecorated subclasses referenced from a route', () => {
    test('an undecorated middleware subclass does not resolve to its base class guard', async () => {
      @Middleware()
      class ReadGuard extends AsenaMiddlewareService {
        public handle() {
          middlewareCalls.push('ReadGuard');
        }
      }

      // The @Middleware decorator was forgotten on the stricter guard
      class AdminGuard extends ReadGuard {
        public override handle() {
          middlewareCalls.push('AdminGuard');
        }
      }

      @Controller('/undecorated-mw')
      class UndecoratedMiddlewareController {
        @Get({ path: '/danger', middlewares: [AdminGuard] })
        public danger(context: AsenaContext<any, any>) {
          return context.send({ ok: true });
        }
      }

      // The boot must fail loudly and name the offending class. Silently substituting the base
      // class's weaker guard is the one answer that must not happen: the route would register,
      // the request would be authorized by ReadGuard, and nothing would be logged.
      const failure = await boot([ReadGuard, UndecoratedMiddlewareController]).then(
        () => undefined,
        (error: Error) => error,
      );

      if (!failure) {
        const guarded = registered.find((route) => route.path === '/undecorated-mw/danger');

        throw new Error(
          `boot succeeded - /undecorated-mw/danger registered, guarded by ${identify(guarded.middlewares[0])}`,
        );
      }

      expect(failure.message).toMatch(/AdminGuard[\s\S]*@Middleware/);
      expect(middlewareCalls).not.toContain('ReadGuard');
    });

    test('an undecorated validator subclass does not resolve to its base class validator', async () => {
      @Middleware({ validator: true })
      class PermissiveValidator {
        public json() {
          return { parse: (value: unknown) => value };
        }
      }

      class StrictValidator extends PermissiveValidator {
        public override json() {
          return {
            parse: () => {
              throw new Error('rejected');
            },
          };
        }
      }

      @Controller('/undecorated-validator')
      class UndecoratedValidatorController {
        @Post({ path: '/submit', validator: StrictValidator })
        public submit(context: AsenaContext<any, any>) {
          return context.send({ ok: true });
        }
      }

      // Same rule for validators: the permissive base accepts everything, so substituting it for
      // the strict subclass would let through every request the author meant to reject.
      const failure = await boot([PermissiveValidator, UndecoratedValidatorController]).then(
        () => undefined,
        (error: Error) => error,
      );

      if (!failure) {
        const submit = registered.find((route) => route.path === '/undecorated-validator/submit');

        // The permissive base parses anything; the strict subclass throws. Running the resolved
        // validator is the only way to say which one the route actually got.
        const accepted = ((): boolean => {
          try {
            (submit.validator as any).json.handle({ value: 'anything' });

            return true;
          } catch {
            return false;
          }
        })();

        throw new Error(
          `boot succeeded - /undecorated-validator/submit registered with a validator that ` +
            `${accepted ? 'accepts' : 'rejects'} input, i.e. ${accepted ? 'PermissiveValidator' : 'StrictValidator'}`,
        );
      }

      // Deliberately NOT pinned to the remedy the message names. It currently says "Decorate it
      // with @Validator()", and there is no @Validator decorator in this framework - validators
      // are declared `@Middleware({ validator: true })`. Asserting that string would freeze
      // advice that cannot be followed. What must hold is the offending class name (the class is
      // usually in a file the reader is not looking at) and that the message says why.
      expect(failure.message).toMatch(/StrictValidator/);
      expect(failure.message).toMatch(/not a component/);
      expect(failure.message).toMatch(/identity is not inherited/);
    });
  });
});
