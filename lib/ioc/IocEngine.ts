import type { Component, IocConfig } from './types';
import { Scope } from './types';
import { Container } from './Container';
import { getAllFiles } from './helper/fileHelper';
import * as path from 'node:path';
import type { Class } from '../server/types';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from './constants';
import * as process from 'node:process';
import * as console from 'node:console';
import { getStrategyClass } from './helper/iocHelper';

export class IocEngine {

  private readonly _container: Container;

  private injectables: Component[] = [];

  private readonly config: IocConfig;

  public constructor(config: IocConfig) {
    this._container = new Container();

    this.config = config;
  }

  public async searchAndRegister(): Promise<void> {
    const files: string[] = getAllFiles(this.config.sourceFile);

    this.injectables = await this.getInjectables(files);

    const injectableClasses = this.injectables.map((c) => c.Class);

    const report = this.detectCycleAndReport(injectableClasses, this.injectables);

    if (report.hasCycle) {
      throw new Error(`Dependency cycle detected: \n \n ${report.cyclePath}`);
    }

    const sortedInjectables = this.topologicalSort(injectableClasses, this.injectables);

    this.register(sortedInjectables);
  }

  private register(injectables: Class[]) {
    for (const injectable of injectables) {
      const name = getMetadata(ComponentConstants.NameKey, injectable) || injectable.name;

      this._container.register(name, injectable, getMetadata(ComponentConstants.ScopeKey, injectable) === Scope.SINGLETON);

      const _interface = getMetadata(ComponentConstants.InterfaceKey, injectable);

      if (_interface) {
        this._container.register(_interface, injectable, getMetadata(ComponentConstants.ScopeKey, injectable) === Scope.SINGLETON);
      }
    }
  }

  private async getInjectables(files: string[]) {
    const components = await Promise.all(
      files.map(async (file) => {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          let fileContent: any;

          try {
            fileContent = await import(path.join(process.cwd(), file));
          } catch (e) {
            console.log(e);

            return [];
          }

          return Object.values(fileContent);
        }

        return [] as Component[];
      }),
    );

    return (
      components
        .flatMap((c) => c)
        .filter((c) => {
          try {
            return !!getMetadata(ComponentConstants.IOCObjectKey, c as any);
          } catch (e) {
            return false;
          }
        })
        // @ts-ignore
        .map((_component: Class) => {
          const face: string = getMetadata(ComponentConstants.InterfaceKey, _component);
          const component: Component = {
            Class: _component as Class,
            interface: face,
          };

          return component;
        })
        .flat() as Component[]
    );
  }

  private topologicalSort(classes: Class[], injectables: Component[]): Class[] {
    const sorted: Class[] = [];
    const visited: Class[] = [];

    function visit(_component: Class | Class[]) {
      let components = Array.isArray(_component) ? [..._component] : [_component];

      for (const component of components) {
        if (visited.find((iter) => iter.name === component.name)) return;

        visited.push(component);

        const dependencies: Class[] = Object.values(
          getMetadata(ComponentConstants.DependencyKey, component),
        ) as Class[];

        const strategyDeps = getStrategyClass(
          getMetadata(ComponentConstants.StrategyKey, component),
          injectables,
        ) as Class[];

        const totalDeps: Class[] = [...dependencies, ...strategyDeps];

        for (const dep of totalDeps) {
          visit(dep);
        }

        sorted.push(component);
      }
    }

    for (const key of classes) {
      visit(key);
    }

    return sorted;
  }

  // Todo: needs to update with new interface object
  private detectCycleAndReport(
    classes: Class[],
    injectables: Component[],
  ): { hasCycle: boolean; cyclePath: string | null } {
    const visited: Set<Class> = new Set();
    const recStack: Set<Class> = new Set();
    const path: Map<Class, Class> = new Map();

    function visit(_component: Class | Class[]) {
      let components = Array.isArray(_component) ? [..._component] : [_component];

      // eslint-disable-next-line no-unreachable-loop
      for (const component of components) {
        if (recStack.has(component)) {
          let cycleComponent: Class | undefined = component;
          const cyclePath: Class[] = [];

          do {
            cyclePath.push(cycleComponent!);

            cycleComponent = path.get(cycleComponent!);
          } while (cycleComponent && cycleComponent !== _component);

          cyclePath.push(component);

          return true;
        }

        if (visited.has(component)) {
          return false;
        }

        visited.add(component);

        recStack.add(component);

        const dependencyDeps: Class[] = Object.values(getMetadata(ComponentConstants.DependencyKey, component)) as Class[];

        const strategyDeps = getStrategyClass(getMetadata(ComponentConstants.StrategyKey, component), injectables) as Class[];

        const totalDeps: Class[] = [...dependencyDeps, ...strategyDeps];

        for (const _dep of totalDeps) {
          if (!_dep) {
            return true;
          }

          let deps = Array.isArray(_dep) ? [..._dep] : [_dep];

          for (const dep of deps) {
            path.set(dep, component);

            if (visit(dep)) {
              return true;
            }
          }
        }

        recStack.delete(component);

        return false;
      }
    }

    for (const component of classes) {
      if (visit(component)) {
        const recStackArray = Array.from(recStack);
        const cyclePath = recStackArray.map((c) => c.name).join(' -> ');

        return { hasCycle: true, cyclePath: recStackArray[recStackArray.length - 1].name + ' -> ' + cyclePath };
      }
    }

    return { hasCycle: false, cyclePath: null };
  }

  public get container(): Container {
    return this._container;
  }

}
