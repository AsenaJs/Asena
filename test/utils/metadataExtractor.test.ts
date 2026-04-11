import { describe, expect, test } from 'bun:test';
import { Controller, Service, Middleware } from '../../lib/server/decorators';
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
