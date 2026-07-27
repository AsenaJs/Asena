import { describe, expect, test, beforeEach } from 'bun:test';
import { PrepareFrontendControllerService } from '../../../lib/server/src/services/PrepareFrontendControllerService';
import { Container } from '../../../lib/ioc';
import { FrontendController } from '../../../lib/server/decorators';
import { Page } from '../../../lib/server/web/decorators/Page';

describe('PrepareFrontendControllerService', () => {
  let prepareService: PrepareFrontendControllerService;
  let container: Container;

  beforeEach(async () => {
    container = new Container();
    prepareService = new PrepareFrontendControllerService();
    (prepareService as any).container = container;
  });

  test('should return empty array when no frontend controllers exist', async () => {
    const result = await prepareService.prepare();

    expect(result).toEqual([]);
  });

  test('should extract HTML routes from a frontend controller', async () => {
    const mockBundle = { index: 'test.html' };

    @FrontendController('/ui')
    class TestFrontendController {
      @Page('/home')
      homePage() {
        return mockBundle;
      }
    }

    const instance = new TestFrontendController();

    await container.registerInstance('TestFrontendController', instance);

    const result = await prepareService.prepare();

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/ui/home');
    expect(result[0].htmlBundle).toBe(mockBundle);
    expect(result[0].controllerName).toBe('TestFrontendController');
  });

  test('should handle multiple pages in one controller', async () => {
    const homeBundle = { index: 'home.html' };
    const aboutBundle = { index: 'about.html' };

    @FrontendController('/app')
    class MultiFrontendController {
      @Page('/home')
      homePage() {
        return homeBundle;
      }

      @Page('/about')
      aboutPage() {
        return aboutBundle;
      }
    }

    const instance = new MultiFrontendController();

    await container.registerInstance('MultiFrontendController', instance);

    const result = await prepareService.prepare();

    expect(result).toHaveLength(2);

    const paths = result.map((r) => r.path);

    expect(paths).toContain('/app/home');
    expect(paths).toContain('/app/about');
  });

  test('should return empty array for controller with no @Page methods', async () => {
    @FrontendController('/empty')
    class EmptyFrontendController {}

    const instance = new EmptyFrontendController();

    await container.registerInstance('EmptyFrontendController', instance);

    const result = await prepareService.prepare();

    expect(result).toEqual([]);
  });

  test('should throw when @Page method returns null', async () => {
    @FrontendController('/ui')
    class BadFrontendController {
      @Page('/broken')
      brokenPage() {
        return null;
      }
    }

    const instance = new BadFrontendController();

    await container.registerInstance('BadFrontendController', instance);

    expect(prepareService.prepare()).rejects.toThrow('returned null/undefined');
  });

  test('should unwrap { default: bundle } from dynamic import()', async () => {
    const realBundle = { index: 'home.html' };

    @FrontendController('/ui')
    class ImportFrontendController {
      @Page('/home')
      async homePage() {
        // Simulates: return import('./pages/home.html')
        // Dynamic import() returns { __esModule: true, default: HTMLBundle }
        return { default: realBundle };
      }
    }

    const instance = new ImportFrontendController();

    await container.registerInstance('ImportFrontendController', instance);

    const result = await prepareService.prepare();

    expect(result).toHaveLength(1);
    expect(result[0].htmlBundle).toBe(realBundle); // unwrapped from .default
  });

  test('should handle async @Page method returning bundle directly', async () => {
    const bundle = { index: 'async.html' };

    @FrontendController('/ui')
    class AsyncFrontendController {
      @Page('/async')
      async asyncPage() {
        return bundle; // no .default wrapper
      }
    }

    const instance = new AsyncFrontendController();

    await container.registerInstance('AsyncFrontendController', instance);

    const result = await prepareService.prepare();

    expect(result).toHaveLength(1);
    expect(result[0].htmlBundle).toBe(bundle);
  });

  test('should build correct path with root base path', async () => {
    const bundle = { index: 'index.html' };

    @FrontendController('/')
    class RootFrontendController {
      @Page('/dashboard')
      dashboard() {
        return bundle;
      }
    }

    const instance = new RootFrontendController();

    await container.registerInstance('RootFrontendController', instance);

    const result = await prepareService.prepare();

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/dashboard');
  });

  // @Page writes to the class declaring the method, so a shared layout base class used to
  // lose all of its pages the moment it was extended.
  describe('inheritance', () => {
    test('registers a page declared only on the base class, under the subclass base path', async () => {
      const bundle = { index: 'shared.html' };

      abstract class SharedPagesBase {
        @Page('/shared')
        sharedPage() {
          return bundle;
        }
      }

      @FrontendController('/tenant')
      class TenantFrontendController extends SharedPagesBase {}

      await container.registerInstance('TenantFrontendController', new TenantFrontendController());

      const result = await prepareService.prepare();

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/tenant/shared');
      expect(result[0].htmlBundle).toBe(bundle);
    });

    test('keeps inherited pages when the subclass declares its own', async () => {
      abstract class SharedPagesBase {
        @Page('/shared')
        sharedPage() {
          return { index: 'shared.html' };
        }
      }

      @FrontendController('/tenant')
      class TenantFrontendController extends SharedPagesBase {
        @Page('/own')
        ownPage() {
          return { index: 'own.html' };
        }
      }

      await container.registerInstance('TenantFrontendController', new TenantFrontendController());

      const result = await prepareService.prepare();

      expect(result.map((route) => route.path).sort()).toEqual(['/tenant/own', '/tenant/shared']);
    });

    test('a subclass page with the same method name overrides the inherited one', async () => {
      const overriding = { index: 'overriding.html' };

      abstract class SharedPagesBase {
        @Page('/shared')
        sharedPage() {
          return { index: 'base.html' };
        }
      }

      @FrontendController('/tenant')
      class TenantFrontendController extends SharedPagesBase {
        @Page('/shared')
        override sharedPage() {
          return overriding;
        }
      }

      await container.registerInstance('TenantFrontendController', new TenantFrontendController());

      const result = await prepareService.prepare();

      expect(result).toHaveLength(1);
      expect(result[0].htmlBundle).toBe(overriding);
    });

    test('collects pages from a three-deep chain', async () => {
      abstract class Grandparent {
        @Page('/a')
        pageA() {
          return { index: 'a.html' };
        }
      }

      abstract class Parent extends Grandparent {
        @Page('/b')
        pageB() {
          return { index: 'b.html' };
        }
      }

      @FrontendController('/chain')
      class Leaf extends Parent {
        @Page('/c')
        pageC() {
          return { index: 'c.html' };
        }
      }

      await container.registerInstance('Leaf', new Leaf());

      const result = await prepareService.prepare();

      expect(result.map((route) => route.path).sort()).toEqual(['/chain/a', '/chain/b', '/chain/c']);
    });

    test('two frontend controllers extending one base do not contaminate each other', async () => {
      abstract class SharedPagesBase {
        @Page('/shared')
        sharedPage() {
          return { index: 'shared.html' };
        }
      }

      @FrontendController('/first')
      class FirstFrontendController extends SharedPagesBase {
        // An own page on purpose: contamination is a *write* into the shared base's stored
        // record, so two empty subclasses cannot detect it however the merge is implemented.
        @Page('/only-first')
        onlyFirst() {
          return { index: 'first.html' };
        }
      }

      @FrontendController('/second')
      class SecondFrontendController extends SharedPagesBase {}

      await container.registerInstance('FirstFrontendController', new FirstFrontendController());
      await container.registerInstance('SecondFrontendController', new SecondFrontendController());

      const result = await prepareService.prepare();

      expect(result.map((route) => route.path).sort()).toEqual([
        '/first/only-first',
        '/first/shared',
        '/second/shared',
      ]);
    });

    /**
     * KNOWN BUG (0.9.0, unfixed at the time of writing) - see the audit report.
     *
     * `AsenaServer.checkDuplicateRoute` throws `Duplicate route detected` when two @Get methods
     * resolve to one path, precisely because inheritance makes the other method live in a file
     * you are not looking at. @Page went through the same merge in 0.9.0 and got no equivalent
     * check, so the identical collision registers the same HTML path twice and one of the two
     * silently wins inside the adapter.
     */
    // NOTE: there is deliberately no "two @Page methods on one path are rejected" test at this
    // layer. This service only collects and merges page routes; the duplicate check lives in the
    // adapters, where `registerHTMLRoute` throws `Duplicate HTML route: "…" is already registered`
    // on both hono and ergenecore. A colliding pair therefore fails the boot loudly today, and
    // adding a second check here would guard a failure mode that is already covered.
  });
});
