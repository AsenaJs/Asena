import type { AsenaAdapter, Route } from '../../adapter';
import { ComponentConstants, ComponentType, ICoreServiceNames } from '../../ioc';
import type { Class } from '../../server/types';
import type { MiddlewareClass } from '../../server/web/middleware';
import { getOwnTypedMetadata, getTypedMetadata } from '../../utils';
import { createMockFromClass } from '../factory/mockFactory';
import { discoverInjectedFieldsFromClass } from '../metadata/discovery';
import { createTestApp } from './createTestApp';
import { silentLogger } from './silentLogger';
import type { WebTestOptions, WebTestResult } from './types';

/**
 * The registered container name for a component
 *
 * @internal
 */
function componentName(Class: Class): string {
  return getTypedMetadata<string>(ComponentConstants.NameKey, Class) || Class.name;
}

/**
 * Collects the classes the web layer cannot function without.
 *
 * Middlewares, validators and static-serve configs are resolved **by name from the
 * container** at start-up (PrepareMiddlewareService / PrepareValidatorService) and throw
 * when missing, so a slice test has to register them for real rather than mock them.
 *
 * @internal
 */
function collectWebLayer(controllers: Class[]): Set<Class> {
  const webLayer = new Set<Class>(controllers);

  for (const controller of controllers) {
    for (const middleware of getTypedMetadata<MiddlewareClass[]>(ComponentConstants.MiddlewaresKey, controller) || []) {
      webLayer.add(middleware as unknown as Class);
    }

    const routes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, controller) || {};

    for (const params of Object.values(routes)) {
      for (const middleware of params.middlewares || []) {
        webLayer.add(middleware as unknown as Class);
      }

      if (params.validator) {
        webLayer.add(params.validator as unknown as Class);
      }

      if (params.staticServe) {
        webLayer.add(params.staticServe as unknown as Class);
      }
    }
  }

  return webLayer;
}

/**
 * Boots only the web layer of an application - the equivalent of Spring's `@WebMvcTest`.
 *
 * The controllers, their middlewares and their validators run for real. Every other
 * dependency they inject is replaced by an auto-generated mock shaped like the real class,
 * so a controller test never drags in a database or an HTTP client.
 *
 * Core services (the container, the logger, `ulak(...)`, the event emitter, ...) are always
 * real - they are wired during bootstrap, before user components exist.
 *
 * @param options - Adapter, controllers and optional explicit overrides
 * @returns The started app plus every double in play, keyed by service name
 *
 * @example
 * ```typescript
 * const { app, mocks } = await createWebTest({ adapter, controllers: [UserController] });
 *
 * mocks.UserService.findById.mockResolvedValue({ id: '1', name: 'Ada' });
 *
 * await app.get('/users/1').expectStatus(200).expectJson({ id: '1', name: 'Ada' });
 * expect(mocks.UserService.findById).toHaveBeenCalledWith('1');
 *
 * await app.stop();
 * ```
 */
export async function createWebTest<A extends AsenaAdapter<any, any> = AsenaAdapter<any, any>>(
  options: WebTestOptions<A>,
): Promise<WebTestResult> {
  const { adapter, controllers, components = [], overrides = {}, logger = silentLogger, port, dispatch } = options;

  const controllerList = Array.isArray(controllers) ? controllers : [controllers];

  if (!controllerList.length) {
    throw new Error('createWebTest requires at least one @Controller class.');
  }

  for (const controller of controllerList) {
    if (typeof controller !== 'function' || !getTypedMetadata(ComponentType.CONTROLLER, controller)) {
      throw new Error(
        `createWebTest expects @Controller classes, but received '${(controller as any)?.name ?? typeof controller}'. ` +
          'Pass services and middlewares through `components` instead.',
      );
    }
  }

  const realComponents = collectWebLayer(controllerList);

  for (const component of components) {
    realComponents.add(component);
  }

  const realNames = new Set<string>();

  for (const component of realComponents) {
    realNames.add(componentName(component));
  }

  const coreServiceNames = new Set<string>(Object.values(ICoreServiceNames));
  const autoMocks: Record<string, any> = {};

  for (const component of realComponents) {
    for (const field of discoverInjectedFieldsFromClass(component)) {
      const { serviceName, serviceClass, fieldName } = field;

      // Core services are wired during bootstrap and are always real - mocking them would
      // also trip the factory's core-key guard. ulak(...) lands here.
      if (coreServiceNames.has(serviceName)) {
        continue;
      }

      // Already satisfied - either registered for real or replaced by the caller
      if (realNames.has(serviceName) || Object.hasOwn(overrides, serviceName)) {
        continue;
      }

      // One shared mock per service, so two controllers injecting it see the same double
      if (Object.hasOwn(autoMocks, serviceName)) {
        continue;
      }

      if (!serviceClass) {
        logger.warn(
          `createWebTest: '${serviceName}' (field '${fieldName}' on ${component.name}) was injected by name, ` +
            'so its method shape is unknown and the mock will be an empty object. ' +
            'Pass an explicit override if the test needs its methods.',
        );
      }

      autoMocks[serviceName] = createMockFromClass(serviceClass);
    }
  }

  const app = await createTestApp({
    adapter,
    logger,
    port,
    dispatch,
    components: [...realComponents],
    // Explicit overrides win over the generated ones
    overrides: { ...autoMocks, ...overrides },
  });

  return { app, mocks: { ...autoMocks, ...overrides } };
}
