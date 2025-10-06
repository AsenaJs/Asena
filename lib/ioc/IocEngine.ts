import type { InjectableComponent, Dependencies, IocConfig, Strategies, ICoreService } from './types';
import type { Container } from './Container';
import { getAllFiles } from './helper/fileHelper';
import * as path from 'node:path';
import type { Class } from '../server/types';
import { ComponentConstants } from './constants';
import * as process from 'node:process';
import * as console from 'node:console';
import { getStrategyClass } from './helper/iocHelper';
import { getOwnTypedMetadata, getTypedMetadata } from '../utils/typedMetadata';
import { Scope, Inject } from './component';
import { CoreService } from './decorators';

/**
 * @description IoC Engine - Manages component registration and dependency injection
 * Core service that handles automatic component discovery and registration
 */
@CoreService('IocEngine')
export class IocEngine implements ICoreService {

  public serviceName = 'IocEngine';

  @Inject('Container')
  private _container: Container;

  private injectables: InjectableComponent[] = [];

  private config?: IocConfig;

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

    const injectableClasses = this.injectables.map((c) => c.Class);

    await this.validateAndRegisterComponents(injectableClasses);
  }

  private async loadComponents(components?: InjectableComponent[]): Promise<void> {
    if (components?.length) {
      this.injectables = components;
      return;
    }

    if (!this.config) {
      throw new Error('No components or configuration found');
    }

    const files = getAllFiles(this.config.sourceFolder);
    const newInjectables = await this.getInjectables(files);

    this.injectables = [...this.injectables, ...newInjectables];

    if (!this.injectables.length) {
      throw new Error('No components found');
    }
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

      if (_interface) {
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
    const importPromises = files.map(async (file) => {
      try {
        const filePath = path.join(process.cwd(), file);
        const module = await import(filePath);

        return Object.values(module);
      } catch (error) {
        // Use proper logging instead of console.log
        console.error(`Failed to import file ${file}:`, error);
        return [];
      }
    });

    const results = await Promise.all(importPromises);

    return results.flat();
  }

  private processComponents(components: any[]): InjectableComponent[] {
    return components
      .filter((component) => this.isValidComponent(component))
      .map((component) => this.createComponentObject(component))
      .filter((component): component is InjectableComponent => component !== null);
  }

  private isValidComponent(component: any): boolean {
    try {
      return !!getTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, component);
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
      console.error('Failed to create component object:', error);
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
      const currentNode = queue.shift()!;

      visitedCount++;

      const currentClass = nameToClass.get(currentNode);

      if (currentClass) {
        sorted.push(currentClass);
      }

      const neighbors = adjacencyList.get(currentNode) || [];

      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;

        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visitedCount !== inDegree.size) {
      const cycle = this.findCycle(adjacencyList);

      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }

    return sorted.reverse();
  }

  // eslint-disable-next-line max-params
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

  private getDependencies(component: Class): string[] {
    try {
      const directDependencies = Object.values(
        getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, component) || {},
      ) as string[];

      const softDependencies = Object.values(
        getOwnTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, component) || {},
      ) as string[];

      const parentClass = Object.getPrototypeOf(component);

      if (
        parentClass &&
        parentClass !== Object.prototype &&
        // circular detection
        // eslint-disable-next-line no-useless-concat
        parentClass.toString() !== 'function () {\n' + '    [native code]\n' + '}'
      ) {
        const parentDependencies = this.getDependencies(parentClass);
        const parentName = getTypedMetadata<string>(ComponentConstants.NameKey, parentClass) || parentClass.name;

        return [
          ...new Set([
            ...directDependencies,
            ...parentDependencies,
            ...softDependencies,
            parentName, // We are adding parent class as soft dep so extenden classes will be created after parent class generete
          ]),
        ];
      }

      return [...new Set([...directDependencies, ...softDependencies])];
    } catch {
      return [];
    }
  }

  private getStrategyDependencies(component: Class, injectables: InjectableComponent[]): string[] {
    try {
      const strategyMeta = getOwnTypedMetadata<Strategies>(ComponentConstants.StrategyKey, component);

      const directStrategies = getStrategyClass(strategyMeta, injectables);

      const parentClass = Object.getPrototypeOf(component);

      if (parentClass && parentClass !== Object.prototype) {
        const parentStrategies = this.getStrategyDependencies(parentClass.constructor, injectables);

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
