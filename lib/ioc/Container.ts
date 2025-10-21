import type { Class } from '../server/types';
import type { ComponentType, ContainerService, Dependencies, Expressions, Strategies } from './types';
import { ComponentConstants } from './constants';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils/typedMetadata';
import { CircularDependencyDetector } from './CircularDependencyDetector';
import { CORE_SERVICE } from './decorators/CoreService';

export class Container {

  private _services: { [key: string]: ContainerService | ContainerService[] } = {};

  private circularDetector = new CircularDependencyDetector();

  public constructor(services?: { [key: string]: ContainerService | ContainerService[] }) {
    this._services = services || {};
  }

  public async register(key: string, Class: Class, singleton: boolean) {
    if (this._services[key]) {
      if (Array.isArray(this._services[key])) {
        this._services[key].push({ Class, instance: singleton ? await this.prepareInstance(Class) : null, singleton });

        return;
      }

      this._services[key] = [
        this._services[key],
        { Class, instance: singleton ? await this.prepareInstance(Class) : null, singleton },
      ];

      return;
    }

    this._services[key] = { Class, instance: singleton ? await this.prepareInstance(Class) : null, singleton };
  }

  /**
   * @description Register an already-created instance directly
   * Useful for external dependencies like Logger, Adapter
   * @param {string} key - Service identifier
   * @param {T} instance - Pre-created instance
   * @returns {Promise<void>}
   */
  public async registerInstance<T>(key: string, instance: T): Promise<void> {
    if (this._services[key]) {
      throw new Error(`Service '${key}' is already registered`);
    }

    this._services[key] = {
      Class: instance.constructor as any,
      instance: instance,
      singleton: true,
    };
  }

  public async resolve<T>(key: string): Promise<(T | T[]) | null> {
    // Check circular dependency
    this.circularDetector.checkCircular(key);
    this.circularDetector.push(key);

    try {
      const service = this._services[key];

      if (!service) {
        throw new Error(key + ' is not registered');
      }

      if (Array.isArray(service)) {
        return await this.resolveMultipleContainerService<T>(service);
      }

      return await this.resolveContainerService<T>(service);
    } finally {
      this.circularDetector.pop(key);
    }
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
            return getTypedMetadata(typeOfComponent, service.Class);
          });
        }

        return getTypedMetadata(typeOfComponent, value.Class);
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

  /**
   * @description Executes PostConstruct methods on the instance.
   * Prevents duplicate execution of inherited methods by tracking executed method names.
   * @param {any} newInstance - The instance to execute PostConstructs on
   * @param {Class} Class - The class of the instance
   * @returns {Promise<void>}
   */
  private async executePostConstructs(newInstance: any, Class: Class): Promise<void> {
    const prototypeChain = this.getPrototypeChain(Class);
    const executedMethods = new Set<string>();

    for (const classInChain of prototypeChain.reverse()) {
      const postConstructs: string[] = getOwnTypedMetadata<string[]>(ComponentConstants.PostConstructKey, classInChain);

      if (!postConstructs) {
        continue;
      }

      for (const postConstruct of postConstructs) {
        // Skip if already executed (prevents duplicate execution in inheritance chain)
        if (executedMethods.has(postConstruct)) {
          continue;
        }

        try {
          await newInstance[postConstruct]();
          executedMethods.add(postConstruct);
        } catch (error) {
          console.log('Error in post construct, exiting process');
          console.error(error);
          process.exit(1);
        }
      }
    }
  }

  private async injectStrategies(newInstance: any, Class: Class) {
    const prototypeChain = this.getPrototypeChain(Class);

    for (const classInChain of prototypeChain.reverse()) {
      const strategyList = getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, classInChain);

      if (!strategyList) continue;

      for (const [propertyKey, interfaceName] of Object.entries(strategyList)) {
        if (!interfaceName) {
          continue;
        }

        if (typeof interfaceName !== 'string') {
          throw new Error('interfaceName must be a string');
        }

        if (Object.getOwnPropertyDescriptor(newInstance, propertyKey)) continue;

        const strategy: Class[] = await this.resolveStrategy<Class>(interfaceName);

        const expression: Expressions = getOwnTypedMetadata<Expressions>(
          ComponentConstants.ExpressionKey,
          classInChain,
        );

        Object.defineProperty(newInstance, propertyKey, {
          get() {
            return expression && expression[propertyKey] ? strategy.map((s) => expression[propertyKey](s)) : strategy;
          },
          enumerable: true,
          configurable: true,
        });
      }
    }
  }

  private async injectDependencies(newInstance: any, Class: Class) {
    const prototypeChain = this.getPrototypeChain(Class);

    for (const classInChain of prototypeChain.reverse()) {
      const deps = getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, classInChain);

      if (!deps) continue;

      let property: PropertyDescriptor;

      for (const [k, name] of Object.entries(deps)) {
        property = Object.getOwnPropertyDescriptor(newInstance, k);

        if (property && property.value !== undefined) continue;

        const instance: Class | Class[] = await this.resolve<Class>(name);

        if (instance === null) {
          throw new Error('Instance cant be null ' + name);
        }

        if (Array.isArray(instance) && instance.length < 1) {
          throw new Error('instance error cannot be null');
        }

        const expression: Expressions = getOwnTypedMetadata<Expressions>(
          ComponentConstants.ExpressionKey,
          classInChain,
        );

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

  /**
   * @description Checks if a class is a framework class (CoreService)
   * Framework classes can traverse the prototype chain even if they contain native code patterns
   * @param {any} cls - The class to check
   * @returns {boolean} True if the class is a framework class
   */
  private isFrameworkClass(cls: any): boolean {
    if (!cls || cls === Object.prototype) {
      return false;
    }

    // Check if class is marked as a CoreService
    const isCoreService = getTypedMetadata<boolean>(CORE_SERVICE, cls);

    return Boolean(isCoreService);
  }

  private getPrototypeChain(Class: any): any[] {
    const chain: any[] = [];
    let currentClass = Class;

    while (currentClass && currentClass !== Object.prototype) {
      const classSource = currentClass.toString();
      const isNativeCode = classSource.includes('[native code]');

      // Stop at native code unless it's a framework class
      if (isNativeCode && !this.isFrameworkClass(currentClass)) {
        break;
      }

      chain.push(currentClass);
      currentClass = Object.getPrototypeOf(currentClass);
    }

    return chain;
  }

  public get services(): { [p: string]: ContainerService | ContainerService[] } {
    return this._services;
  }

  public set services(value: { [p: string]: ContainerService | ContainerService[] }) {
    this._services = value;
  }

}
