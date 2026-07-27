import { describe, expect, test } from 'bun:test';
import { Controller, Service, Middleware } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import {
  isController,
  isService,
  isMiddleware,
  isValidator,
  getComponentType,
  extractComponentName,
  extractControllerRouteInfo,
} from '../../lib/utils';

class PlainClass {}

@Controller('/api')
class TestController {}

@Controller({ path: '/api/described', description: 'A described controller' })
class DescribedController {}

@Service()
class TestService {}

@Middleware()
class TestMiddleware {
  handle() {}
}

@Middleware({ validator: true })
class TestValidator {
  json() {}
}

@Service('CustomName')
class NamedService {}

abstract class RouteCarryingBase {
  @Get('/live')
  live() {}
}

@Controller('/inheriting')
class InheritingController extends RouteCarryingBase {
  @Get('/own')
  own() {}
}

@Controller('/overriding')
class OverridingRouteController extends RouteCarryingBase {
  @Get('/subclass-live')
  override live() {}
}

describe('isController', () => {
  test('@Controller class returns true', () => {
    expect(isController(TestController)).toBe(true);
  });

  test('@Service class returns false', () => {
    expect(isController(TestService)).toBe(false);
  });

  test('plain class returns false', () => {
    expect(isController(PlainClass)).toBe(false);
  });
});

describe('isService', () => {
  test('@Service class returns true', () => {
    expect(isService(TestService)).toBe(true);
  });

  test('@Controller class returns false', () => {
    expect(isService(TestController)).toBe(false);
  });

  test('plain class returns false', () => {
    expect(isService(PlainClass)).toBe(false);
  });
});

describe('isMiddleware', () => {
  test('@Middleware class returns true', () => {
    expect(isMiddleware(TestMiddleware)).toBe(true);
  });

  test('@Middleware({ validator: true }) also returns true', () => {
    expect(isMiddleware(TestValidator)).toBe(true);
  });

  test('plain class returns false', () => {
    expect(isMiddleware(PlainClass)).toBe(false);
  });
});

describe('isValidator', () => {
  test('@Middleware({ validator: true }) returns true', () => {
    expect(isValidator(TestValidator)).toBe(true);
  });

  test('@Middleware() without validator returns false', () => {
    expect(isValidator(TestMiddleware)).toBe(false);
  });

  test('plain class returns false', () => {
    expect(isValidator(PlainClass)).toBe(false);
  });
});

describe('getComponentType', () => {
  test('@Controller returns CONTROLLER', () => {
    expect(getComponentType(TestController)).toBe('CONTROLLER');
  });

  test('@Service returns SERVICE', () => {
    expect(getComponentType(TestService)).toBe('SERVICE');
  });

  test('@Middleware returns MIDDLEWARE', () => {
    expect(getComponentType(TestMiddleware)).toBe('MIDDLEWARE');
  });

  test('plain class returns undefined', () => {
    expect(getComponentType(PlainClass)).toBeUndefined();
  });
});

describe('extractControllerRouteInfo', () => {
  test('controller with description returns description', () => {
    const info = extractControllerRouteInfo(new DescribedController());

    expect(info.basePath).toBe('/api/described');
    expect(info.description).toBe('A described controller');
  });

  test('controller without description returns empty string', () => {
    const info = extractControllerRouteInfo(new TestController());

    expect(info.basePath).toBe('/api');
    expect(info.description).toBe('');
  });

  // @asenajs/asena-openapi builds its schema from this function. If it reported a different
  // route set than AsenaServer registers, the published schema would silently omit every
  // inherited endpoint.
  describe('inheritance', () => {
    test('reports routes declared on a base class', () => {
      const info = extractControllerRouteInfo(new InheritingController());

      expect(Object.keys(info.routes).sort()).toEqual(['live', 'own']);
      expect(info.basePath).toBe('/inheriting');
    });

    test('the subclass route wins for a shared method name', () => {
      const info = extractControllerRouteInfo(new OverridingRouteController());

      expect(Object.keys(info.routes)).toEqual(['live']);
      expect(info.routes['live'].path).toBe('subclass-live');
    });

    test('reports an empty route map for a controller with no routes anywhere', () => {
      const info = extractControllerRouteInfo(new TestController());

      expect(info.routes).toEqual({});
    });
  });
});

describe('extractComponentName', () => {
  test('decorated class returns class name', () => {
    expect(extractComponentName(TestController)).toBe('TestController');
  });

  test('custom name returns custom name', () => {
    expect(extractComponentName(NamedService)).toBe('CustomName');
  });

  test('plain class returns empty string', () => {
    expect(extractComponentName(PlainClass)).toBe('');
  });
});
