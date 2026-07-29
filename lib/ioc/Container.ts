import type { Class } from '../server/types';
import type {
  ComponentPostProcessor,
  ComponentType,
  ContainerService,
  Dependencies,
  Expressions,
  LifecycleComponent,
  StartHookMode,
  Strategies,
} from './types';
import { ComponentConstants } from './constants';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils';
import { CircularDependencyDetector } from './CircularDependencyDetector';
import { CORE_SERVICE } from './decorators';

/**
 * The message behind an assignment to a wired field.
 *
 * Injected fields are installed as accessors with no setter, so assigning to one throws the
 * engine's own `TypeError: Attempted to assign to readonly property.` - no field name, no class,
 * no hint at what to do instead. Everybody reaches for `Object.assign(instance, {dep: fake})`
 * once; this turns that minute into a sentence.
 */
const injectedFieldMessage = (Class: Class, field: string, decorator: string): string =>
  `Cannot assign to '${field}' on ${Class.name}: fields wired by ${decorator} are read-only. ` +
  "To swap a dependency in a test, use the 'overrides' option of createTestApp()/createWebTest(), " +
  'or mockComponent().';

export class Container {
  private _services: { [key: string]: ContainerService | ContainerService[] } = {};

  private circularDetector = new CircularDependencyDetector();

  private postProcessors: ComponentPostProcessor[] = [];

  private overriddenKeys = new Set<string>();

  /**
   * Whether construction runs start hooks itself.
   *
   * `immediate` is the original behaviour and stays that way for core services, for the
   * post-processor closure the IoC engine registers ahead of everything else, and for every
   * transient. `deferred` holds the hooks back so `LifecycleService` can run them from
   * `server.start()`, once the whole graph exists.
   */
  private startHookMode: StartHookMode = 'immediate';

  /**
   * Every singleton built by `register()`, in registration order - which the IoC engine has
   * already topologically sorted, so dependencies come before dependents. Start hooks walk it
   * forwards, stop hooks backwards.
   *
   * Instances handed in through `registerInstance()` are deliberately absent: nothing ever ran
   * a start hook on them, so there is no started/stopped pair to keep symmetric.
   */
  private lifecycleComponents: LifecycleComponent[] = [];

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

    const instance = singleton ? await this.prepareInstance(Class) : null;

    if (singleton) {
      this.trackLifecycle(key, instance, Class);
    }

    if (this._services[key]) {
      if (Array.isArray(this._services[key])) {
        this._services[key].push({ Class, instance, singleton });

        return;
      }

      this._services[key] = [this._services[key], { Class, instance, singleton }];

      return;
    }

    this._services[key] = { Class, instance, singleton };
  }

  /**
   * @description Record a singleton for the start/stop lifecycle.
   *
   * `started` reflects what already happened rather than what is planned: a component built in
   * immediate mode has run its start hooks by the time it gets here, so it is stoppable at once.
   * A deferred one is not started until `LifecycleService` says so - and a component that never
   * started must never be stopped.
   *
   * @param {string} key - Service identifier
   * @param {unknown} instance - The post-processed instance
   * @param {Class} Class - The class it was built from
   * @returns {void}
   */
  private trackLifecycle(key: string, instance: unknown, Class: Class): void {
    this.lifecycleComponents.push({
      key,
      instance,
      Class,
      started: this.startHookMode === 'immediate',
    });
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

  /**
   * @description Resolve every implementation registered under a strategy key.
   *
   * Cardinality is normalized here rather than borrowed from resolve(). `_services[key]` has
   * three shapes - absent, a bare ContainerService, an array - and resolve() maps them to
   * throw / T / T[]. That is right for @Inject, whose dependency is single-valued: it is
   * either there or the component is broken. @Strategy is multi-valued by construction, so
   * zero is a cardinality it has to be able to take (a plugin point before its first plugin)
   * and one has to arrive as a one-element array like any other count.
   *
   * This used to be a cast over resolve(), which made it correct at exactly one cardinality:
   * an empty key aborted the boot, and a single implementation was injected as a bare
   * instance whose first `.length` / `for...of` / `.map()` failed at runtime.
   *
   * @param {string} key - Strategy (interface) key
   * @returns {Promise<T[]>} Every implementation, empty when the key has none
   */
  public async resolveStrategy<T>(key: string): Promise<T[]> {
    // Kept from resolve(): a cycle running through a strategy key must still be reported
    // rather than recursing until the stack overflows
    this.circularDetector.checkCircular(key);
    this.circularDetector.push(key);

    try {
      const service = this._services[key];

      if (!service) {
        return [];
      }

      return Array.isArray(service)
        ? await this.resolveMultipleContainerService<T>(service)
        : [await this.resolveContainerService<T>(service)];
    } finally {
      this.circularDetector.pop(key);
    }
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

  /**
   * @description Choose whether construction runs start hooks or hands them to LifecycleService.
   *
   * The IoC engine switches to `deferred` around user components only. Post-processors keep
   * running theirs at construction because `postProcess()` reads state a start hook sets - defer
   * that and every component the processor wraps is built against an uninitialised processor.
   *
   * @param {StartHookMode} mode - immediate (default) or deferred
   * @returns {void}
   */
  public setStartHookMode(mode: StartHookMode): void {
    this.startHookMode = mode;
  }

  /**
   * @description Singletons in registration order, for the start/stop lifecycle.
   * @returns {LifecycleComponent[]} The live list - LifecycleService flips `started` on it
   */
  public get lifecycle(): LifecycleComponent[] {
    return this.lifecycleComponents;
  }

  private async prepareInstance<T>(Class: Class) {
    const newInstance = new Class();

    await this.injectDependencies(newInstance, Class); // dependency injection

    await this.injectStrategies(newInstance, Class); // strategy injection

    // Post-processing (skipped when postProcessors is empty - zero overhead)
    let processed: any = newInstance;

    for (const processor of this.postProcessors) {
      processed = (await processor.postProcess(processed, Class)) ?? processed;
    }

    // Deferred mode leaves the start hooks to LifecycleService. The hook runs against the
    // *processed* instance either way - a post-processor may have returned a proxy, and the
    // hook has to see the same object every other component was injected with.
    if (this.startHookMode === 'immediate') {
      await this.executeStartHooks(processed, Class);
    }

    return processed as T;
  }

  /**
   * @description Run every @OnStart (and its @PostConstruct alias) method on an instance.
   *
   * Walks the prototype chain ancestors-first and runs each method name once, so a hook
   * inherited by three classes still fires once.
   *
   * A failure used to `process.exit(1)` here, which turned one broken component into a suite
   * reporting `0 pass / 1 fail` with no indication of why. It now throws, naming the hook, with
   * the original error as `cause` - the boot fails, the process decides what to do about it.
   *
   * @param {any} instance - The instance to run hooks on
   * @param {Class} Class - The class of the instance
   * @returns {Promise<void>}
   */
  public async executeStartHooks(instance: any, Class: Class): Promise<void> {
    for (const hook of this.collectHookMethods(Class, ComponentConstants.PostConstructKey)) {
      try {
        await instance[hook]();
      } catch (error) {
        throw new Error(`@OnStart hook '${Class.name}.${hook}()' failed`, { cause: error });
      }
    }
  }

  /**
   * @description The @OnStop method names for a class, in the order they should run.
   *
   * Reversed relative to the start hooks so a component tears down in the opposite order it
   * was brought up, matching how LifecycleService walks the components themselves.
   *
   * @param {Class} Class - The class to inspect
   * @returns {string[]} Method names, empty when the class declares none
   */
  public getStopHooks(Class: Class): string[] {
    return this.collectHookMethods(Class, ComponentConstants.OnStopKey).reverse();
  }

  /**
   * @description The @OnStart method names for a class, in the order they run.
   * @param {Class} Class - The class to inspect
   * @returns {string[]} Method names, empty when the class declares none
   */
  public getStartHooks(Class: Class): string[] {
    return this.collectHookMethods(Class, ComponentConstants.PostConstructKey);
  }

  /**
   * @description Collect decorated method names across the prototype chain, de-duplicated.
   * @param {Class} Class - The class to inspect
   * @param {symbol} metadataKey - Which hook list to read
   * @returns {string[]} Method names, ancestors first
   */
  private collectHookMethods(Class: Class, metadataKey: symbol): string[] {
    const prototypeChain = this.getPrototypeChain(Class);
    const methods: string[] = [];
    const seen = new Set<string>();

    for (const classInChain of prototypeChain.reverse()) {
      const hooks: string[] = getOwnTypedMetadata<string[]>(metadataKey, classInChain);

      if (!hooks) {
        continue;
      }

      for (const hook of hooks) {
        // Skip if already collected (prevents duplicate execution in inheritance chain)
        if (seen.has(hook)) {
          continue;
        }

        seen.add(hook);
        methods.push(hook);
      }
    }

    return methods;
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
          set: () => {
            throw new TypeError(injectedFieldMessage(Class, propertyKey, '@Strategy'));
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
          set: () => {
            throw new TypeError(injectedFieldMessage(Class, k, '@Inject'));
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
