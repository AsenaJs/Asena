import { describe, expect, test } from 'bun:test';
import { ComponentConstants } from '../../../../lib/ioc';
import { getOwnTypedMetadata } from '../../../../lib/utils/typedMetadata';
import { Controller, Middleware } from '../../../../lib/server/decorators';
import { Get, Post } from '../../../../lib/server/web/decorators';
import { AsenaMiddlewareService } from '../../../../lib/server/web/middleware';
import type { Dependencies } from '../../../../lib/ioc';

// defineMiddleware records every middleware a controller touches as a soft dependency, so
// the IoC graph creates them before the controller. It used to read the key off
// `target.constructor` (which for a class is `Function`, and never holds it) while writing to
// `target` - so each call started from an empty record and overwrote the last one. @Controller
// runs after the route decorators, so route-level middlewares were always the ones lost.

@Middleware()
class AuthMiddleware extends AsenaMiddlewareService {
  public handle() {}
}

@Middleware()
class RateLimitMiddleware extends AsenaMiddlewareService {
  public handle() {}
}

@Middleware()
class AuditMiddleware extends AsenaMiddlewareService {
  public handle() {}
}

// `@Middleware('RenamedMiddleware')` also works at runtime - defineComponent maps a bare
// string to `{ name }` - but the decorator is typed `(params?: MiddlewareParams)`, so the
// string form does not type-check. Same registered name either way.
@Middleware({ name: 'RenamedMiddleware' })
class NamedMiddleware extends AsenaMiddlewareService {
  public handle() {}
}

const softDeps = (target: any): string[] =>
  Object.values(getOwnTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, target) || {}).sort();

describe('defineMiddleware soft dependencies', () => {
  test('records controller-level middlewares', () => {
    @Controller({ path: '/top', middlewares: [AuthMiddleware] })
    class TopOnlyController {
      @Get('/x')
      public x() {}
    }

    expect(softDeps(TopOnlyController)).toEqual(['AuthMiddleware']);
  });

  test('records route-level middlewares alongside controller-level ones', () => {
    @Controller({ path: '/mixed', middlewares: [AuthMiddleware] })
    class MixedController {
      @Get({ path: '/x', middlewares: [RateLimitMiddleware] })
      public x() {}
    }

    expect(softDeps(MixedController)).toEqual(['AuthMiddleware', 'RateLimitMiddleware']);
  });

  test('records middlewares from every route, not just the last one', () => {
    @Controller('/many')
    class ManyRoutesController {
      @Get({ path: '/a', middlewares: [AuthMiddleware] })
      public a() {}

      @Post({ path: '/b', middlewares: [RateLimitMiddleware] })
      public b() {}

      @Get({ path: '/c', middlewares: [AuditMiddleware] })
      public c() {}
    }

    expect(softDeps(ManyRoutesController)).toEqual(['AuditMiddleware', 'AuthMiddleware', 'RateLimitMiddleware']);
  });

  test('does not duplicate a middleware used on several routes', () => {
    @Controller('/repeat')
    class RepeatController {
      @Get({ path: '/a', middlewares: [AuthMiddleware] })
      public a() {}

      @Get({ path: '/b', middlewares: [AuthMiddleware] })
      public b() {}
    }

    expect(softDeps(RepeatController)).toEqual(['AuthMiddleware']);
  });

  test('uses the registered component name, not the class name', () => {
    @Controller({ path: '/named', middlewares: [NamedMiddleware] })
    class NamedMiddlewareController {
      @Get('/x')
      public x() {}
    }

    expect(softDeps(NamedMiddlewareController)).toEqual(['RenamedMiddleware']);
  });

  test('leaves no soft dependencies when no middleware is used', () => {
    @Controller('/bare')
    class BareController {
      @Get('/x')
      public x() {}
    }

    expect(softDeps(BareController)).toEqual([]);
  });

  test('a base class carrying route middlewares does not pollute the subclass record', () => {
    abstract class GuardedBase {
      @Get({ path: '/guarded', middlewares: [AuthMiddleware] })
      public guarded() {}
    }

    @Controller({ path: '/sub', middlewares: [RateLimitMiddleware] })
    class SubController extends GuardedBase {}

    // The route decorator ran against the base class, so its middleware is recorded there.
    expect(softDeps(GuardedBase)).toEqual(['AuthMiddleware']);
    expect(softDeps(SubController)).toEqual(['RateLimitMiddleware']);
  });
});
