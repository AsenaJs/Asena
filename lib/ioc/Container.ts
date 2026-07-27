import type { Class } from '../server/types';
import type {
  ComponentPostProcessor,
  ComponentType,
  ContainerService,
  Dependencies,
  Expressions,
  Strategies,
} from './types';
import { ComponentConstants } from './constants';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils';
import { CircularDependencyDetector } from './CircularDependencyDetector';
import { CORE_SERVICE } from './decorators';

export class Container {
  private _services: { [key: string]: ContainerService | ContainerService[] } = {};

  private circularDetector = new CircularDependencyDetector();

  private postProcessors: ComponentPostProcessor[] = [];

  private overriddenKeys = new Set<string>();

  public constructor(services?: { [key: string]: ContainerService | ContainerService[] }) {
    this._services = services || {};
  }

  public async register(key: string, Class: Class, singleton: boolean) {
    // An overridden key keeps its test double. Returning early means the real class is
    // never instantiated (no @PostConstruct side effects) and the entry never turns
    // into an array, which is what resolve() would otherwise hand back.
    if (this.overriddenKeys.has(key)) {
      return;
    }

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

  /**
   * @description Replace a service with a pre-created test double (Spring's @MockBean).
   *
   * Seeds the container before user components are registered: any later `register()`
   * call for the same key becomes a no-op, so the real class is never constructed and
   * dependents capture the override in their injection closures.
   *
   * @param {string} key - Service identifier to override
   * @param {T} instance - Replacement instance
   * @returns {void}
   */
  public overrideInstance<T>(key: string, instance: T): void {
    if (instance === null || instance === undefined) {
      throw new Error(
        `Cannot override service '${key}' with ${instance === null ? 'null' : 'undefined'} - ` +
          'an override must be an object instance. ' +
          'A null override would fail later with an opaque "instance cannot be null" error at resolve time.',
      );
    }

    this.overriddenKeys.add(key);

    this._services[key] = {
      Class: ((instance as any).constructor ?? Object) as Class,
      instance,
      singleton: true,
    };
  }

  /**
   * @description Check whether a key has been replaced by an override
   * @param {string} key - Service key
   * @returns {boolean}
   */
  public isOverridden(key: string): boolean {
    return this.overriddenKeys.has(key);
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

  /**
   * @description Check if a service is registered without resolving it
   * @param {string} key - Service key
   * @returns {boolean}
   */
  public has(key: string): boolean {
    return this._services[key] !== undefined;
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
        // Own-only, matching `metadataExtractor.isController` and friends. Walking the chain
        // here meant a @Service extending a @Controller answered true for CONTROLLER, so it was
        // resolved as one - and since PathKey is own-only it mounted its inherited routes at the
        // server root.
        if (Array.isArray(value)) {
          // check every element in the array is the same type
          return value.every((service) => {
            return getOwnTypedMetadata(typeOfComponent, service.Class);
          });
        }

        return getOwnTypedMetadata(typeOfComponent, value.Class);
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

  /**
   * @description Register a ComponentPostProcessor for post-processing newly created instances.
   * PostProcessors are called in FIFO order after DI + PostConstruct.
   * @param {ComponentPostProcessor} processor - The post-processor to register
   */
  public registerPostProcessor(processor: ComponentPostProcessor): void {
    this.postProcessors.push(processor);
  }

  private async prepareInstance<T>(Class: Class) {
    const newInstance = new Class();

    await this.injectDependencies(newInstance, Class); // dependency injection

    await this.injectStrategies(newInstance, Class); // strategy injection

    await this.executePostConstructs(newInstance, Class); // post construct

    // Post-processing (skipped when postProcessors is empty - zero overhead)
    let processed: any = newInstance;

    for (const processor of this.postProcessors) {
      processed = (await processor.postProcess(processed, Class)) ?? processed;
    }

    return processed as T;
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

        // Same guard shape as injectDependencies, deliberately. Testing for the *descriptor*
        // broke two ways: the chain runs ancestors-first, so a base class's accessor made the
        // subclass's @Strategy override look "already set" and it was skipped; and under
        // `useDefineForClassFields` (the default at ES2022+) an initializer-less field is an
        // own property `= undefined` at construction, so the strategy was never injected at
        // all. Bun's transpiler uses Set semantics, which is why running from source hides it.
        const strategyProperty = Object.getOwnPropertyDescriptor(newInstance, propertyKey);

        if (strategyProperty?.value !== undefined) continue;

        const strategy: Class[] = await this.resolveStrategy<Class>(interfaceName);

        const expression: Expressions = getOwnTypedMetadata<Expressions>(
          ComponentConstants.ExpressionKey,
          classInChain,
        );

        Object.defineProperty(newInstance, propertyKey, {
          get() {
            return expression?.[propertyKey] ? strategy.map((s) => expression[propertyKey](s)) : strategy;
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

        if (property?.value !== undefined) continue;

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
            return expression?.[k] ? expression[k](instance) : instance;
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

  /**
   * Deliberately NOT `getPrototypeChainOf` from utils, even though the two overlap.
   *
   * This walk carries two rules the generic helper does not: it bails out at a class whose
   * source reads `[native code]` (so injection never tries to walk into a built-in or a bound
   * constructor), with an escape hatch for `@CoreService` classes, and it returns leaf-first
   * because every caller here reverses it themselves.
   *
   * The generic helper is the right reader for decorator metadata; this one guards instance
   * construction. Merging them would mean picking one set of stop conditions for both.
   */
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
