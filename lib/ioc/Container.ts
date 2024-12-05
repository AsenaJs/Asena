import type { Class } from '../server/types';
import type { ComponentType, ContainerService, Expression } from './types';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from './constants';

export class Container {

  private _services: { [key: string]: ContainerService | ContainerService[] } = {};

  public constructor(services?: { [key: string]: ContainerService | ContainerService[] }) {
    this._services = services || {};
  }

  public register(key: string, Class: Class, singleton: boolean) {
    if (this._services[key]) {
      if (Array.isArray(this._services[key])) {
        this._services[key].push({ Class, instance: singleton ? this.prepareInstance(Class) : null, singleton });

        return;
      }

      this._services[key] = [
        this._services[key],
        { Class, instance: singleton ? this.prepareInstance(Class) : null, singleton },
      ];

      return;
    }

    this._services[key] = { Class, instance: singleton ? this.prepareInstance(Class) : null, singleton };
  }

  public async resolve<T>(key: string): Promise<(T | T[]) | null> {
    const service = this._services[key];

    if (!service) {
      throw new Error('Service not found');
    }

    if (Array.isArray(service)) {
      return await this.resolveMultipleContainerService<T>(service);
    }

    return await this.resolveContainerService<T>(service);
  }

  public resolveStrategy<T>(key: string): Promise<T[] | null> {
    return this.resolve<T>(key) as Promise<T[] | null>;
  }

  /**
   * @typeOfComponent is the type of the component
   *
   * */
  public async resolveAll<T>(typeOfComponent: ComponentType) {
    const matchingServices = this.filterServices(typeOfComponent);

    if (!matchingServices.length) {
      return null;
    }

    const instances: (T | T[])[] = [];

    for (const containerService of matchingServices) {
      if (Array.isArray(containerService)) {
        instances.push(await this.resolveMultipleContainerService<T>(containerService));
      } else {
        instances.push(await this.resolveContainerService<T>(containerService));
      }
    }

    return instances;
  }

  private filterServices(typeOfComponent: ComponentType) {
    return Object.entries(this._services)
      .filter(([, value]) => {
        if (Array.isArray(value)) {
          // check every element in the array is the same type
          return value.every((service) => {
            return getMetadata(typeOfComponent, service.Class);
          });
        }

        return getMetadata(typeOfComponent, value.Class);
      })
      .map(([, value]) => value);
  }

  private async resolveContainerService<T>(containerService: ContainerService): Promise<T> {
    if (!containerService.singleton) {
      return await this.prepareInstance<T>(containerService.Class);
    }

    if (!containerService.instance) {
      throw new Error('instance cannot be null');
    }

    return containerService.instance as T;
  }

  private async resolveMultipleContainerService<T>(containerService: ContainerService[]): Promise<T[]> {
    return Promise.all(containerService.map(async (_service) => this.resolveContainerService<T>(_service)));
  }

  private async prepareInstance<T>(Class: Class) {
    const newInstance = new Class();

    await this.injectDependencies(newInstance, Class); // dependency injection

    await this.injectStrategies(newInstance, Class); // strategy injection

    await this.executePostConstructs(newInstance, Class); // post construct

    return newInstance as T;
  }

  private async executePostConstructs(newInstance: any, Class: Class) {
    const postConstructs: string[] = getMetadata(ComponentConstants.PostConstructKey, Class);

    if (!postConstructs) {
      return;
    }

    for (const postConstruct of postConstructs) {
      await newInstance[postConstruct]();
    }
  }

  private async injectStrategies(newInstance: any, Class: Class) {
    for (const [propertyKey, interfaceName] of Object.entries(getMetadata(ComponentConstants.StrategyKey, Class))) {
      if (!interfaceName) {
        continue;
      }

      if (typeof interfaceName !== 'string') {
        throw new Error('interfaceName must be a string');
      }

      const strategy: Class[] = await this.resolveStrategy<Class>(interfaceName);

      const expression: Expression = getMetadata(ComponentConstants.ExpressionKey, Class);

      Object.defineProperty(newInstance, propertyKey, {
        get() {
          return expression && expression[propertyKey] ? strategy.map((s) => expression[propertyKey](s)) : strategy;
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  private async injectDependencies(newInstance: any, Class: Class) {
    for (const [k, V] of Object.entries(getMetadata(ComponentConstants.DependencyKey, Class))) {
      const name = getMetadata(ComponentConstants.NameKey, V) || (V as Class).name;

      const instance: Class | Class[] = await this.resolve<Class>(name);

      if (instance === null) {
        throw new Error('Instance cant be null ' + V);
      }

      if (Array.isArray(instance) && instance.length < 1) {
        throw new Error('instance error cannot be null');
      }

      if (instance instanceof (V as Class)) {
        const expression: Expression = getMetadata(ComponentConstants.ExpressionKey, Class);

        Object.defineProperty(newInstance, k, {
          get: () => {
            return expression && expression[k] ? expression[k](instance) : instance;
          },
          enumerable: true,
          configurable: true,
        });
      }
    }
  }

  public get services(): { [p: string]: ContainerService | ContainerService[] } {
    return this._services;
  }

  public set services(value: { [p: string]: ContainerService | ContainerService[] }) {
    this._services = value;
  }

}
