import {
  type ComponentPostProcessor,
  ComponentType,
  type Dependencies,
  type ICoreService,
  ICoreServiceNames,
  type InjectableComponent,
  type IocConfig,
  type Strategies,
} from './types';
import type { Container } from './Container';
import { getAllFiles } from './helper/fileHelper';
import * as path from 'node:path';
import type { Class } from '../server/types';
import { ComponentConstants } from './constants';
import * as process from 'node:process';
import { getStrategyClass } from './helper/iocHelper';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils';
import { getComponentsDeclaredIn, Inject, Scope } from './component';
import { CoreService } from './decorators';
import { CircularDependencyError } from './CircularDependencyDetector';
import type { ServerLogger } from '../logger';

/**
 * @description IoC Engine - Manages component registration and dependency injection
 * Core service that handles automatic component discovery and registration
 */
/**
 * @description How long a single component file may take to import before the
 * engine points at it. Only a warning - the import is never cancelled.
 */
const DEFAULT_IMPORT_TIMEOUT = 10_000;

@CoreService(ICoreServiceNames.IOC_ENGINE)
export class IocEngine implements ICoreService {
  public serviceName = 'IocEngine';

  @Inject('Container')
  private _container: Container;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger: ServerLogger;

  private injectables: InjectableComponent[] = [];

  private config?: IocConfig;

  /** Entry files kept out of the scan, empty unless the scan actually ran */
  private entryFiles = new Set<string>();

  /** Entry-declared components that existed by the time the scan ran */
  private entryComponents = new Set<Class>();

  /**
   * @description Set IoC configuration
   * @param {IocConfig} config - IoC configuration object
   * @returns {void}
   */
  public setConfig(config?: IocConfig): void {
    this.config = config;
  }

  public async searchAndRegister(components?: InjectableComponent[]): Promise<void> {
    // load components
    await this.loadComponents(components);

    this.reportEmptyStrategyKeys();

    const injectableClasses = this.injectables.map((c) => c.Class);

    // Two-phase registration for PostProcessor support
    const { postProcessorClasses, remainingClasses } = this.separatePostProcessors(injectableClasses);

    // Phase A: Register PostProcessors and their dependencies first (without post-processing)
    if (postProcessorClasses.length > 0) {
      await this.validateAndRegisterComponents(postProcessorClasses);

      // Resolve only actual PostProcessor instances (not their dependencies) and activate them
      for (const cls of postProcessorClasses) {
        const isPostProcessor = getOwnTypedMetadata<boolean>(ComponentType.POST_PROCESSOR, cls);

        if (isPostProcessor) {
          const name = getTypedMetadata<string>(ComponentConstants.NameKey, cls) || cls.name;
          const instance = await this._container.resolve<ComponentPostProcessor>(name);

          this._container.registerPostProcessor(instance as ComponentPostProcessor);
        }
      }
    }

    // Phase B: Register remaining components (post-processing is now active)
    if (remainingClasses.length > 0) {
      await this.validateAndRegisterComponents(remainingClasses);
    }
  }

  private async loadComponents(components?: InjectableComponent[]): Promise<void> {
    if (components?.length) {
      // Explicitly listed components go through the same identity check as scanned ones.
      // They used to bypass it entirely, so the own-only rule held for `sourceFolder` apps and
      // not for `components: [...]` ones - and on that path an undecorated subclass still
      // registered under its base's name, overwriting it.
      this.injectables = this.dedupeInjectables(
        components.filter((component) => {
          if (this.isValidComponent(component.Class)) {
            return true;
          }

          this.warnAboutUndecoratedSubclass(component.Class);

          return false;
        }),
      );

      return;
    }

    if (!this.config) {
      throw new Error('No components or configuration found');
    }

    const entryFiles = (this.entryFiles = this.resolveEntryFiles());

    // The entry file must not be imported. While it awaits AsenaServerFactory.create
    // at module scope it is in the evaluating-async state, so importing it here is a
    // cyclic dynamic import that can only settle once this scan returns - a deadlock
    // (Bun >= 1.3.14 follows the spec and waits, older versions short-circuited it).
    const files = getAllFiles(this.config.sourceFolder).filter((file) => !entryFiles.has(this.toAbsolutePath(file)));

    const scanned = await this.getInjectables(files);

    // Components declared directly in the entry file are still supported: their
    // decorators ran before the bootstrap call, so they come from the registry
    // rather than from a module namespace
    const entryClasses = getComponentsDeclaredIn(entryFiles);

    this.entryComponents = new Set(entryClasses);

    const declaredInEntry = this.processComponents(entryClasses);

    this.injectables = this.dedupeInjectables([...this.injectables, ...scanned, ...declaredInEntry]);

    if (!this.injectables.length) {
      throw new Error('No components found');
    }
  }

  /**
   * @description Report components that were declared in the entry file *after* the
   * bootstrap call. Their decorators had not run yet when the scan read the registry,
   * so they never made it into the container - and without this they would just be
   * quietly missing at runtime.
   * @returns {void}
   */
  public warnAboutLateEntryComponents(): void {
    if (!this.entryFiles.size) {
      return;
    }

    const late = getComponentsDeclaredIn(this.entryFiles).filter((cls) => !this.entryComponents.has(cls));

    if (!late.length) {
      return;
    }

    this.logger.warn(
      `[IocEngine] ${late.length} component(s) declared after the AsenaServerFactory.create() call were not ` +
        `registered: ${late.map((cls) => cls.name).join(', ')}. ` +
        'Move them above the bootstrap call, or into their own file under sourceFolder.',
    );
  }

  /**
   * @description Absolute paths of the files that must be kept out of the scan:
   * the entry declared in the config, and the module actually being executed.
   * They are usually the same file, but not always - a project may declare one
   * `rootFile` and start another, or run without a config at all.
   * @returns {Set<string>} Resolved absolute entry paths
   */
  private resolveEntryFiles(): Set<string> {
    const entryFiles = new Set<string>();

    if (this.config?.rootFile) {
      entryFiles.add(path.resolve(process.cwd(), this.config.rootFile));
    }

    const runningModule = typeof Bun !== 'undefined' ? Bun.main : process.argv[1];

    if (runningModule) {
      entryFiles.add(path.resolve(runningModule));
    }

    return entryFiles;
  }

  /**
   * @description Resolve a scanned path against the working directory. `getAllFiles`
   * mirrors the form of the folder it was given, so a `sourceFolder` configured as an
   * absolute path yields absolute entries that must not be joined onto cwd again.
   * @param {string} file - Path as returned by the scan
   * @returns {string} Absolute path
   */
  private toAbsolutePath(file: string): string {
    return path.isAbsolute(file) ? path.normalize(file) : path.resolve(process.cwd(), file);
  }

  /**
   * @description Collapse components that arrived from more than one source - a class
   * re-exported through a barrel file, or one found by both the scan and the registry.
   *
   * Deduplication is by class identity, not by name: `Container.register` promotes a
   * key to an array when the same name is registered twice, which would construct the
   * component a second time (running @PostConstruct again) and hand every dependent an
   * array instead of an instance.
   * @param {InjectableComponent[]} components - Components from every source
   * @returns {InjectableComponent[]} Components with duplicates removed
   */
  private dedupeInjectables(components: InjectableComponent[]): InjectableComponent[] {
    const seen = new Set<Class>();
    const byName = new Map<string, Class>();
    const unique: InjectableComponent[] = [];

    for (const component of components) {
      if (seen.has(component.Class)) continue;

      seen.add(component.Class);

      const name = getTypedMetadata<string>(ComponentConstants.NameKey, component.Class) || component.Class.name;
      const claimed = byName.get(name);

      if (claimed && claimed !== component.Class) {
        // A component name is an identity, so two classes claiming one is a conflict, not a
        // preference. It used to be a warning, and the resolution was silent and arbitrary:
        // `initializeGraph` keyed classes by name in a Map, so whichever came last in scan order
        // won and the other was never registered. A route naming the loser ran the winner's
        // handler, and `@Inject(Loser)` returned an instance of the winner - the same failure the
        // duplicate-route check exists to prevent, one layer down. On the explicit
        // `components: [...]` path there was not even a warning.
        throw new Error(
          `Duplicate component name detected: '${name}' is claimed by both ` +
            `${claimed.name} and ${component.Class.name}. A component name must be unique - ` +
            "give one of them an explicit name, e.g. @Service({ name: '...' }).",
        );
      }

      byName.set(name, component.Class);

      unique.push(component);
    }

    return unique;
  }

  private async validateAndRegisterComponents(injectableClasses: Class[]): Promise<void> {
    const sortedInjectables = this.topologicalSort(injectableClasses, this.injectables);

    await this.register(sortedInjectables);
  }

  private async register(injectables: Class[]) {
    for (const injectable of injectables) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, injectable) || injectable.name;

      const isSingleton = getTypedMetadata<Scope>(ComponentConstants.ScopeKey, injectable) === Scope.SINGLETON;

      await this._container.register(name, injectable, isSingleton);

      const _interface = getTypedMetadata<string>(ComponentConstants.InterfaceKey, injectable);

      // An overridden component must not sneak back in under its @Implements interface key -
      // registering there would construct the real class and run its @PostConstruct anyway
      if (_interface && !this._container.isOverridden(name)) {
        await this._container.register(_interface, injectable, isSingleton);
      }
    }
  }

  private async getInjectables(files: string[]): Promise<InjectableComponent[]> {
    const validFiles = files.filter(
      (file) => file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx'),
    );

    const components = await this.importFiles(validFiles);

    return this.processComponents(components);
  }

  private async importFiles(files: string[]): Promise<any[]> {
    const timeout = this.config?.importTimeout ?? DEFAULT_IMPORT_TIMEOUT;

    const importPromises = files.map(async (file) => {
      try {
        const module = await this.importFile(this.toAbsolutePath(file), file, timeout);

        return Object.values(module);
      } catch (error) {
        // A file inside sourceFolder that cannot be imported used to be skipped, which
        // started the server with that component silently missing - the first symptom
        // being an injection failure or a vanished route much later
        this.logger.error(`[IocEngine] Failed to import component file '${file}':`, error);

        throw new Error(`Failed to import component file '${file}'`, { cause: error });
      }
    });

    const results = await Promise.all(importPromises);

    return results.flat();
  }

  /**
   * @description Import a single component file, pointing at it if it takes suspiciously
   * long. A module whose top-level await never settles would otherwise hang the boot with
   * no output at all; the import itself is left alone, only reported.
   * @param {string} filePath - Absolute path to import
   * @param {string} file - Path as scanned, for the message
   * @param {number} timeout - Milliseconds before warning, 0 disables
   * @returns {Promise<any>} The imported module namespace
   */
  private async importFile(filePath: string, file: string, timeout: number): Promise<any> {
    const timer =
      timeout > 0
        ? setTimeout(() => {
            this.logger.warn(
              `[IocEngine] Import of '${file}' has not settled after ${timeout}ms. ` +
                'A top-level await in that file that never resolves will hang startup.',
            );
          }, timeout)
        : undefined;

    try {
      return await import(filePath);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private processComponents(components: any[]): InjectableComponent[] {
    const valid: any[] = [];

    for (const component of components) {
      if (this.isValidComponent(component)) {
        valid.push(component);
        continue;
      }

      this.warnAboutUndecoratedSubclass(component);
    }

    return valid
      .map((component) => this.createComponentObject(component))
      .filter((component): component is InjectableComponent => component !== null);
  }

  /**
   * Reports a class that extends a component but carries no decorator of its own.
   *
   * Component identity is read own-only, so such a class is simply skipped. Before 0.9.0 it
   * was registered under its *base's* name and blew up on first inject - ugly, but at least
   * detectable. Skipping it silently is worse: with `@Schedule` the cron never fires and
   * nothing anywhere says so, which is the exact class of failure this release set out to
   * eliminate.
   *
   * Only fires when an ancestor carries the marker, so an ordinary undecorated helper class in
   * the scan folder stays quiet. A decorator that returns a wrapper subclass (`@Repository`,
   * `@Database`, `@Redis`, `@Kafka`) applies `@Service` to the wrapper, so the wrapper has its
   * own marker and never reaches here.
   */
  private warnAboutUndecoratedSubclass(component: any): void {
    if (typeof component !== 'function') {
      return;
    }

    try {
      if (!getTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, component)) {
        return;
      }
    } catch {
      return;
    }

    let ancestor = Object.getPrototypeOf(component);

    while (typeof ancestor === 'function' && ancestor !== Function.prototype) {
      if (getOwnTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, ancestor)) {
        break;
      }

      ancestor = Object.getPrototypeOf(ancestor);
    }

    this.logger.warn(
      `[IocEngine] '${component.name}' extends the component '${
        typeof ancestor === 'function' ? ancestor.name : 'unknown'
      }' but carries no decorator of its own, so it was NOT registered. ` +
        'Decorate it (@Service, @Controller, @Schedule, ...) or remove it from the scan folder.',
    );
  }

  private isValidComponent(component: any): boolean {
    try {
      // Own-only. A class is whatever its OWN decorator says it is - component identity is not
      // inherited. Reading this off the chain made an *undecorated* subclass a component, and
      // since NameKey is read the same way it registered under its base's name: the container
      // promoted the entry to an array and every @Inject(Base) started returning [Base, Sub].
      return !!getOwnTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, component);
    } catch {
      return false;
    }
  }

  private createComponentObject(component: Class): InjectableComponent | null {
    try {
      const _interface = getTypedMetadata<string>(ComponentConstants.InterfaceKey, component);

      return {
        Class: component,
        interface: _interface,
      };
    } catch (error) {
      this.logger.error('[IocEngine] Failed to create component object:', error);
      return null;
    }
  }

  private topologicalSort(classes: Class[], injectables: InjectableComponent[]): Class[] {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();
    const nameToClass = new Map<string, Class>();

    this.initializeGraph(classes, injectables, inDegree, adjacencyList, nameToClass);

    const queue: string[] = [];

    inDegree.forEach((degree, node) => {
      if (degree === 0) queue.push(node);
    });

    const sorted: Class[] = [];
    let visitedCount = 0;

    while (queue.length > 0) {
      const currentNode = queue.shift();

      visitedCount++;

      const currentClass = nameToClass.get(currentNode);

      if (currentClass) {
        sorted.push(currentClass);
      }

      const neighbors = adjacencyList.get(currentNode) || [];

      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor) - 1;

        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visitedCount !== inDegree.size) {
      const cycle = this.findCycle(adjacencyList);

      throw new CircularDependencyError(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }

    return sorted.reverse();
  }

  private initializeGraph(
    classes: Class[],
    injectables: InjectableComponent[],
    inDegree: Map<string, number>,
    adjacencyList: Map<string, string[]>,
    nameToClass: Map<string, Class>,
  ): void {
    classes.forEach((cls) => {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, cls) || cls.name;

      nameToClass.set(name, cls);
      inDegree.set(name, 0);
      adjacencyList.set(name, []);
    });

    classes.forEach((cls) => {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, cls) || cls.name;
      const dependencies = [...this.getDependencies(cls), ...this.getStrategyDependencies(cls, injectables)];

      dependencies.forEach((dep) => {
        if (dep) {
          adjacencyList.get(name)?.push(dep);
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      });
    });
  }

  private findCycle(adjacencyList: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycle: string[] = [];

    const dfs = (node: string): boolean => {
      if (recStack.has(node)) {
        cycle.push(node);
        return true;
      }

      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const neighbors = adjacencyList.get(node) || [];

      for (const neighbor of neighbors) {
        if (dfs(neighbor)) {
          if (cycle[0] !== cycle[cycle.length - 1]) {
            cycle.push(node);
          }

          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of adjacencyList.keys()) {
      if (dfs(node)) break;
    }

    return cycle.reverse();
  }

  /**
   * @description Separates PostProcessor classes and their transitive dependencies from other components.
   * PostProcessors and their deps are registered in Phase A (before post-processing is active).
   * Non-PostProcessor dependencies pulled into Phase A will NOT be post-processed (by design).
   */
  private separatePostProcessors(classes: Class[]): {
    postProcessorClasses: Class[];
    remainingClasses: Class[];
  } {
    // Find all PostProcessor classes
    const postProcessorSet = new Set<Class>();
    const nameToClass = new Map<string, Class>();

    for (const cls of classes) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, cls) || cls.name;

      nameToClass.set(name, cls);
    }

    // Identify PostProcessor classes
    for (const cls of classes) {
      if (getOwnTypedMetadata<boolean>(ComponentType.POST_PROCESSOR, cls)) {
        postProcessorSet.add(cls);
      }
    }

    if (postProcessorSet.size === 0) {
      return { postProcessorClasses: [], remainingClasses: classes };
    }

    // Compute transitive dependency closure for all PostProcessors
    const closureSet = new Set<Class>(postProcessorSet);

    const addDependencyClosure = (cls: Class) => {
      const deps = [...this.getDependencies(cls), ...this.getStrategyDependencies(cls, this.injectables)];

      for (const depName of deps) {
        const depClass = nameToClass.get(depName);

        if (depClass && !closureSet.has(depClass)) {
          closureSet.add(depClass);

          // Log warning for non-PostProcessor dependencies pulled into Phase A
          if (!getOwnTypedMetadata<boolean>(ComponentType.POST_PROCESSOR, depClass)) {
            const ppName = getTypedMetadata<string>(ComponentConstants.NameKey, cls) || cls.name;

            this.logger.warn(
              `[IocEngine] PostProcessor '${ppName}' depends on '${depName}'. ${depName} will not be post-processed.`,
            );
          }

          // Recurse into this dependency's own dependencies
          addDependencyClosure(depClass);
        }
      }
    };

    for (const ppClass of postProcessorSet) {
      addDependencyClosure(ppClass);
    }

    // Split into two groups
    const postProcessorClasses: Class[] = [];
    const remainingClasses: Class[] = [];

    for (const cls of classes) {
      if (closureSet.has(cls)) {
        postProcessorClasses.push(cls);
      } else {
        remainingClasses.push(cls);
      }
    }

    return { postProcessorClasses, remainingClasses };
  }

  private getDependencies(component: Class): string[] {
    try {
      const directDependencies = Object.values(
        getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, component) || {},
      );

      const softDependencies = Object.values(
        getOwnTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, component) || {},
      );

      const parentClass = Object.getPrototypeOf(component);

      if (
        parentClass &&
        parentClass !== Object.prototype &&
        // circular detection

        parentClass.toString() !== 'function () {\n' + '    [native code]\n' + '}'
      ) {
        const parentDependencies = this.getDependencies(parentClass);
        const parentName = getTypedMetadata<string>(ComponentConstants.NameKey, parentClass) || parentClass.name;
        const selfName = getTypedMetadata<string>(ComponentConstants.NameKey, component) || component.name;

        // A decorator may return a subclass of the class it decorates and register the
        // subclass under the decorated class's own name (@Repository does exactly this).
        // The parent then resolves to the component's own name, which is not a cycle -
        // reporting it as one made the component unresolvable.
        const parentEntry = parentName && parentName !== selfName ? [parentName] : [];

        return [
          ...new Set([
            ...directDependencies,
            ...parentDependencies,
            ...softDependencies,
            // Parent is registered as a soft dep so subclasses are created after it
            ...parentEntry,
          ]),
        ];
      }

      return [...new Set([...directDependencies, ...softDependencies])];
    } catch {
      return [];
    }
  }

  /**
   * Every strategy key a component consumes, keyed by the field that declares it. Walks the
   * prototype chain like getStrategyDependencies does - a @Strategy field on a base class is
   * injected into the subclass too, so it has to be reported against the subclass. Own class
   * first, so a field redeclared in a subclass wins the same way injection resolves it.
   */
  private collectStrategyFields(component: Class): Map<string, string> {
    const fields = new Map<string, string>();

    const own = getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, component);

    for (const [field, key] of Object.entries(own ?? {})) {
      if (typeof key === 'string' && key) {
        fields.set(field, key);
      }
    }

    const parent = Object.getPrototypeOf(component);

    if (typeof parent === 'function' && parent !== Function.prototype) {
      for (const [field, key] of this.collectStrategyFields(parent)) {
        if (!fields.has(field)) {
          fields.set(field, key);
        }
      }
    }

    return fields;
  }

  /**
   * Reports strategy keys nothing implements, once per injection site, at boot.
   *
   * An empty key is a legitimate plugin point and is injected as `[]`, which means a *typo'd*
   * interface name no longer fails at boot either - it surfaces much later as a collection
   * that is silently always empty. This line is what keeps the two apart.
   *
   * `debug` with no fallback to `info`, deliberately unlike the adapters' error handlers
   * (`Ergenecore.respondToError`, `HonoAdapter`): there the line must not disappear, here a
   * deliberate plugin point should stay quiet unless someone is looking.
   */
  private reportEmptyStrategyKeys(): void {
    // Optional twice over: `debug` is optional on ServerLogger, and `logger` itself is absent
    // whenever an IocEngine is built directly instead of through DI - which several suites do.
    // A diagnostic must not be the thing that decides whether registration runs. The warn/error
    // paths elsewhere stay unguarded, so genuinely broken wiring still fails loudly.
    const debug = this.logger?.debug;

    if (!debug) {
      return;
    }

    const implemented = new Set(this.injectables.map((injectable) => injectable.interface).filter(Boolean));

    for (const { Class: component } of this.injectables) {
      const name = getTypedMetadata<string>(ComponentConstants.NameKey, component) || component.name;

      for (const [field, key] of this.collectStrategyFields(component)) {
        // A double seeded through `overrides` is a real implementation of that key - warning
        // here would fire on every slice test that mocks a plugin point
        if (implemented.has(key) || this._container.isOverridden(key)) {
          continue;
        }

        debug.call(
          this.logger,
          `[IocEngine] Strategy key '${key}' has no implementations - ${name}.${field} will be injected as []`,
        );
      }
    }
  }

  private getStrategyDependencies(component: Class, injectables: InjectableComponent[]): string[] {
    try {
      const strategyMeta = getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, component);

      const directStrategies = getStrategyClass(strategyMeta, injectables);

      const parentClass = Object.getPrototypeOf(component);

      // Recurse on the parent class itself. This used to recurse on
      // `parentClass.constructor`, which for a class is always `Function` - so the walk
      // stopped at the first level and a @Strategy field declared on a base class was
      // missing from the dependency graph. The component then resolved before the
      // implementations it needed were registered ("<interface> is not registered").
      if (typeof parentClass === 'function' && parentClass !== Function.prototype) {
        const parentStrategies = this.getStrategyDependencies(parentClass, injectables);

        return [...new Set([...directStrategies, ...parentStrategies])];
      }

      return directStrategies;
    } catch {
      return [];
    }
  }

  public get container(): Container {
    return this._container;
  }
}
