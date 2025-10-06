import { Container } from './Container';
import { IocEngine } from './IocEngine';
import type { AsenaAdapter } from '../adapter';
import type { ServerLogger } from '../logger';
import { CoreBootstrapPhase } from './types';
import { PrepareMiddlewareService } from '../server/src/services/PrepareMiddlewareService';
import { PrepareConfigService } from '../server/src/services/PrepareConfigService';
import { PrepareWebsocketService } from '../server/src/services/PrepareWebsocketService';
import { PrepareValidatorService } from '../server/src/services/PrepareValidatorService';
import { PrepareStaticServeConfigService } from '../server/src/services/PrepareStaticServeConfigService';

/**
 * @description CoreContainer manages framework-level services
 * Handles the bootstrap sequence for core services and user components
 */
export class CoreContainer {

  private readonly _container: Container;

  private _initialized = false;

  private _phase: CoreBootstrapPhase;

  public constructor() {
    this._container = new Container();
    this._phase = CoreBootstrapPhase.CONTAINER_INIT;
  }

  /**
   * @description Bootstrap core framework services
   * Executes Phase 1-5: System-level services
   * @param {AsenaAdapter} adapter - HTTP adapter instance
   * @param {ServerLogger} logger - Logger instance
   * @returns {Promise<void>}
   */
  public async bootstrap(adapter: AsenaAdapter<any, any>, logger: ServerLogger): Promise<void> {
    if (this._initialized) {
      throw new Error('CoreContainer already initialized');
    }

    // Phase 1: Container self-registration
    await this.registerContainer();

    // Phase 2: Logger registration
    await this.registerLogger(logger);

    // Phase 3: IocEngine registration
    await this.registerIocEngine();

    // Phase 4: Adapter registration
    await this.registerAdapters(adapter);

    // Phase 5: Prepare Services registration
    await this.registerPrepareServices();

    this._initialized = true;
  }

  /**
   * @description Resolve a service from container
   * @param {string} key - Service identifier
   * @returns {Promise<T>}
   */
  public async resolve<T>(key: string): Promise<T> {
    return (await this._container.resolve<T>(key)) as Promise<T>;
  }

  /**
   * @description Update current phase (called by AsenaServer)
   * @param {CoreBootstrapPhase} phase - New phase
   * @returns {void}
   */
  public setPhase(phase: CoreBootstrapPhase): void {
    this._phase = phase;
  }

  /**
   * @description Phase 1: Register Container itself
   * @returns {Promise<void>}
   */
  private async registerContainer(): Promise<void> {
    await this._container.registerInstance('Container', this._container);
    this._phase = CoreBootstrapPhase.LOGGER_INIT;
  }

  /**
   * @description Phase 2: Register Logger instance
   * @param {ServerLogger} logger - Logger instance
   * @returns {Promise<void>}
   */
  private async registerLogger(logger: ServerLogger): Promise<void> {
    await this._container.registerInstance('ServerLogger', logger);
    this._phase = CoreBootstrapPhase.IOC_ENGINE_INIT;
  }

  /**
   * @description Phase 3: Register IocEngine   *  will inject Container automatically
   * @returns {Promise<void>}
   */
  private async registerIocEngine(): Promise<void> {
    await this._container.register('IocEngine', IocEngine, true);
    this._phase = CoreBootstrapPhase.HTTP_ADAPTER_INIT;
  }

  /**
   * @description Phase 4: Register HTTP Adapter
   * @param {AsenaAdapter} adapter - HTTP adapter instance
   * @returns {Promise<void>}
   */
  private async registerAdapters(adapter: AsenaAdapter<any, any>): Promise<void> {
    await this._container.registerInstance('AsenaAdapter', adapter);
    this._phase = CoreBootstrapPhase.PREPARE_SERVICES_INIT;
  }

  /**
   * @description Phase 5: Register all Prepare Services
   * They will inject Container and Logger automatically
   * @returns {Promise<void>}
   */
  private async registerPrepareServices(): Promise<void> {
    const services = [
      { name: 'PrepareMiddlewareService', Class: PrepareMiddlewareService },
      { name: 'PrepareConfigService', Class: PrepareConfigService },
      { name: 'PrepareWebsocketService', Class: PrepareWebsocketService },
      { name: 'PrepareValidatorService', Class: PrepareValidatorService },
      { name: 'PrepareStaticServeConfigService', Class: PrepareStaticServeConfigService },
    ];

    for (const service of services) {
      await this._container.register(service.name, service.Class, true);
    }

    this._phase = CoreBootstrapPhase.USER_COMPONENTS_SCAN;
  }

  /**
   * @description Get container instance
   * @returns {Container}
   */
  public get container(): Container {
    return this._container;
  }

  /**
   * @description Get current bootstrap phase
   * @returns {CoreBootstrapPhase}
   */
  public get currentPhase(): CoreBootstrapPhase {
    return this._phase;
  }

  /**
   * @description Check if CoreContainer is initialized
   * @returns {boolean}
   */
  public get isInitialized(): boolean {
    return this._initialized;
  }

}
