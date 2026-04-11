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
});
