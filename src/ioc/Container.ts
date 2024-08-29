import type { Class } from '../server/types';
import type { ContainerService, ComponentType, Injectable } from './types';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { DependencyKey, StrategyKey } from './constants';

export class Container {

  private _services: { [key: string]: ContainerService | ContainerService[] } = {};

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

  public get<T>(key: string): (T | T[]) | null {
    // Todo: return error
    const service = this._services[key];

    if (!service) {
      return null;
    }

    if (Array.isArray(service)) {
      return service.map((containerService): T => {
        if (!containerService.singleton) {
          return this.prepareInstance(containerService.Class) as T;
        }

        if (!containerService.instance) {
          throw new Error('instance cannot be null');
        }

        return containerService.instance as T;
      });
    }

    if (!service.singleton) {
      return this.prepareInstance(service.Class) as T;
    }

    return service.instance as T;
  }

  /**
   * @typeOfComponent is the type of the component
   *
   * */
  public getAll<T>(typeOfComponent: ComponentType): (T | T[])[] | null {
    const service = Object.entries(this._services)
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

    if (!service) {
      return null;
    }

    if (service.length > 0) {
      const mapped = service.map((containerService) => {
        if (Array.isArray(containerService)) {
          return containerService.map((_service) => {
            if (!_service.singleton) {
              return this.prepareInstance(_service.Class) as T;
            }

            if (!_service.instance) {
              throw new Error('instance cannot be null');
            }

            return _service.instance as T;
          });
        }

        if (!containerService.singleton) {
          return this.prepareInstance(containerService.Class) as T;
        }

        if (!containerService.instance) {
          throw new Error('instance cannot be null');
        }

        return containerService.instance as T;
      });

      return mapped;
    }

    return null;
  }

  private prepareInstance(Class: Class) {
    const newInstance = new Class();

    const injects: Injectable = {};

    for (const key of Object.values(getMetadata(DependencyKey, Class)) as Class[]) {
      const instance = this.get(key.name);

      if (instance === null) {
        throw new Error('Instance cant be null ' + key);
      }

      if (Array.isArray(instance) && instance.length < 1) {
        throw new Error('instance error cannot be null');
      }

      // @ts-ignore
      injects[key.name] = instance;
    }

    // inject the services into the instance
    for (const value of Object.values(injects)) {
      for (const [k, v] of Object.entries(getMetadata(DependencyKey, Class))) {
        // @ts-ignore
        if (value instanceof v) {
          (newInstance as any)[k] = value;
        }
      }
    }

    // strategy injection

    for (const [propertyKey, interfaceName] of Object.entries(getMetadata(StrategyKey, Class))) {
      if (!interfaceName) {
        continue;
      }

      if (typeof interfaceName !== 'string') {
        throw new Error('interfaceName must be a string');
      }

      (newInstance as any)[propertyKey] = this.get(interfaceName);
    }

    return newInstance;
  }

  public get services(): { [p: string]: ContainerService | ContainerService[] } {
    return this._services;
  }

  public set services(value: { [p: string]: ContainerService | ContainerService[] }) {
    this._services = value;
  }

}
