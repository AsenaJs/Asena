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

  public getStrategy<T>(key: string): T[] | null {
    return this.get(key) as T[] | null;
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
      return service.map((containerService) => {
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
    }

    return null;
  }

  private prepareInstance(Class: Class) {
    const newInstance = new Class();

    this.injectDependencies(newInstance, Class); // dependency injection

    this.injectStrategies(newInstance, Class); // strategy injection

    return newInstance;
  }

  private injectStrategies(newInstance: any, Class: Class) {
    for (const [propertyKey, interfaceName] of Object.entries(getMetadata(ComponentConstants.StrategyKey, Class))) {
      if (!interfaceName) {
        continue;
      }

      if (typeof interfaceName !== 'string') {
        throw new Error('interfaceName must be a string');
      }

      const strategy: Class[] = this.getStrategy<Class>(interfaceName);

      const expression: Expression = getMetadata(ComponentConstants.ExpressionKey, Class);

      Object.defineProperty(newInstance, propertyKey, {
        get() {
          const value =
            expression && expression[propertyKey] ? strategy.map((s) => expression[propertyKey](s)) : strategy;

          Object.defineProperty(this, propertyKey, {
            value,
            writable: true,
            enumerable: true,
            configurable: false,
          });

          return value;
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  private injectDependencies(newInstance: any, Class: Class) {
    for (const [k, V] of Object.entries(getMetadata(ComponentConstants.DependencyKey, Class))) {
      const name = getMetadata(ComponentConstants.NameKey, V) || (V as Class).name;

      const instance = this.get<Class>(name);

      if (instance === null) {
        throw new Error('Instance cant be null ' + V);
      }

      if (Array.isArray(instance) && instance.length < 1) {
        throw new Error('instance error cannot be null');
      }

      if (instance instanceof (V as Class)) {
        if (getMetadata(ComponentConstants.IsMiddlewareKey, instance.constructor)) {
          continue;
        }

        const expression: Expression = getMetadata(ComponentConstants.ExpressionKey, Class);

        Object.defineProperty(newInstance, k, {
          get: () => {
            const value = expression && expression[k] ? expression[k](instance) : instance;

            Object.defineProperty(this, k, {
              value,
              writable: true,
              enumerable: true,
              configurable: false,
            });

            return value;
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
