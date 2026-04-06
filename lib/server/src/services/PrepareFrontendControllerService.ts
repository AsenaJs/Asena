import type { Container, ICoreService } from '../../../ioc';
import { ComponentConstants, ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';
import { getOwnTypedMetadata, getTypedMetadata } from '../../../utils';
import type { PageRoute } from '../../web/decorators/Page';
import type { Class } from '../../types';
import * as path from 'node:path';

export interface PreparedHTMLRoute {
  path: string;
  htmlBundle: unknown;
  controllerName: string;
}

/**
 * @description Core service for preparing FrontendController components.
 * Resolves FrontendControllers from the container, reads @Page metadata,
 * and collects HTML routes. Adapter registration is handled by AsenaServer.
 */
@CoreService(ICoreServiceNames.PREPARE_FRONTEND_CONTROLLER_SERVICE)
export class PrepareFrontendControllerService implements ICoreService {
  public serviceName = 'PrepareFrontendControllerService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  public async prepare(): Promise<PreparedHTMLRoute[]> {
    const frontendControllers = await this.container.resolveAll<Class>(ComponentType.FRONTEND_CONTROLLER);

    if (!frontendControllers || frontendControllers.length === 0) {
      return [];
    }

    const htmlRoutes: PreparedHTMLRoute[] = [];

    for (const controller of frontendControllers.flat()) {
      const routes = await this.extractHTMLRoutes(controller);

      htmlRoutes.push(...routes);
    }

    return htmlRoutes;
  }

  private async extractHTMLRoutes(controller: Class): Promise<PreparedHTMLRoute[]> {
    const pageRoutes =
      getOwnTypedMetadata<PageRoute>(ComponentConstants.PageRoutesKey, controller.constructor) || {};

    const controllerName =
      getTypedMetadata<string>(ComponentConstants.NameKey, controller.constructor) || controller.constructor.name;

    if (Object.keys(pageRoutes).length === 0) {
      return [];
    }

    const basePath: string =
      getOwnTypedMetadata<string>(ComponentConstants.PathKey, controller.constructor) || '/';

    const routes: PreparedHTMLRoute[] = [];

    for (const [methodName, pageRoute] of Object.entries(pageRoutes)) {
      const fullPath = path.join(basePath, pageRoute.path).replace(/\\/g, '/');
      const result = await controller[methodName]();

      // Dynamic import() returns { default: HTMLBundle }, direct return gives HTMLBundle
      const htmlBundle = result?.default ?? result;

      if (!htmlBundle) {
        throw new Error(
          `@Page method ${controllerName}.${methodName}() returned null/undefined. Must return a Bun HTMLBundle.`,
        );
      }

      routes.push({ path: fullPath, htmlBundle, controllerName });
    }

    return routes;
  }
}