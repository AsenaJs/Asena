import type { Class, StaticServeClass } from './types';
import {
  ComponentType,
  CoreBootstrapPhase,
  type CoreContainer,
  CoreService,
  type ICoreService,
  ICoreServiceNames,
  type IocEngine,
} from '../ioc';
import type {
  ApiParams,
  AsenaAdapter,
  AsenaStartOptions,
  BaseMiddleware,
  BaseStaticServeParams,
  BaseValidator,
  PrepareMiddlewareParams,
  Route,
} from '../adapter';
import * as path from 'node:path';
import type { MiddlewareClass, ValidatorClass } from './web/middleware';
import { ComponentConstants } from '../ioc';
import * as bun from 'bun';
import { blue, green, type ServerLogger, yellow } from '../logger';
import {
  getChainedTypedMetadata,
  getChainedTypedMetadataList,
  getOwnTypedMetadata,
  getTypedMetadata,
} from '../utils/typedMetadata';
import type { PrepareMiddlewareService } from './src/services/PrepareMiddlewareService';
import type { PrepareConfigService } from './src/services/PrepareConfigService';
import type { PrepareWebsocketService } from './src/services/PrepareWebsocketService';
import type { PrepareValidatorService } from './src/services/PrepareValidatorService';
import type { PrepareStaticServeConfigService } from './src/services/PrepareStaticServeConfigService';
import type { PrepareFrontendControllerService } from './src/services/PrepareFrontendControllerService';
import { Inject, PostConstruct } from '../ioc/component';
import type { GlobalMiddlewareConfig, GlobalMiddlewareEntry } from './config';
import { ASENA_CONFIG_FUNCTIONS, ASENA_CONFIG_HOOK_ALIASES, normalizeTransportConfig } from './config/AsenaConfig';
import type { Ulak } from './messaging';
import type { HealthOptions } from './AsenaServerFactory';
import { HealthServer } from './health';
import type { PrepareEventService } from './src/services/PrepareEventService';
import type { PrepareScheduleService } from './src/services/PrepareScheduleService';
import type { PrepareMicroserviceService } from './src/services/PrepareMicroserviceService';
import type { CronRunner } from './schedule';
import type { MessagingInterceptor } from './microservice';
import type { MicroserviceTransport } from './microservice';
import type { LifecycleService } from './lifecycle';
import type { AsenaStopOptions, ShutdownOptions } from './types';

/**
 * Whatever a catch block or a signal handler received, in a shape safe to put in a log line.
 *
 * `String(value)` is not safe here: a rejection can carry any value, and a plain object
 * stringifies to `[object Object]` - which is exactly the log line nobody can act on.
 */
const describeError = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : bun.inspect(error);

/**
 * @description AsenaServer - Main server class for Asena framework
 * Now a core service managed by IoC container with field injection
 */
@CoreService(ICoreServiceNames.ASENA_SERVER)
export class AsenaServer<A extends AsenaAdapter<any, any>> implements ICoreService {
  public serviceName = 'AsenaServer';

  @Inject(ICoreServiceNames.CORE_CONTAINER)
  private _coreContainer!: CoreContainer;

  // NOT injected eagerly: resolved lazily in start() via container.has()
  // so the server can boot in headless mode without an HTTP adapter
  private _adapter?: A;

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private _logger!: ServerLogger;

  @Inject(ICoreServiceNames.IOC_ENGINE)
  private _iocEngine!: IocEngine;

  @Inject(ICoreServiceNames.__ULAK__)
  private _ulak!: Ulak;

  @Inject(ICoreServiceNames.PREPARE_MIDDLEWARE_SERVICE)
  private prepareMiddleware!: PrepareMiddlewareService;

  @Inject(ICoreServiceNames.PREPARE_CONFIG_SERVICE)
  private prepareConfigService!: PrepareConfigService;

  @Inject(ICoreServiceNames.PREPARE_WEBSOCKET_SERVICE)
  private prepareWebsocketService!: PrepareWebsocketService;

  @Inject(ICoreServiceNames.PREPARE_VALIDATOR_SERVICE)
  private prepareValidatorService!: PrepareValidatorService;

  @Inject(ICoreServiceNames.PREPARE_STATIC_SERVE_CONFIG_SERVICE)
  private prepareStaticServeConfigService!: PrepareStaticServeConfigService;

  @Inject(ICoreServiceNames.PREPARE_EVENT_SERVICE)
  private prepareEventService: PrepareEventService;

  @Inject(ICoreServiceNames.PREPARE_SCHEDULE_SERVICE)
  private prepareScheduleService: PrepareScheduleService;

  @Inject(ICoreServiceNames.PREPARE_FRONTEND_CONTROLLER_SERVICE)
  private prepareFrontendControllerService: PrepareFrontendControllerService;

  @Inject(ICoreServiceNames.PREPARE_MICROSERVICE_SERVICE)
  private prepareMicroserviceService: PrepareMicroserviceService;

  @Inject(ICoreServiceNames.CRON_RUNNER)
  private cronRunner: CronRunner;

  @Inject(ICoreServiceNames.LIFECYCLE_SERVICE)
  private lifecycleService: LifecycleService;

  // Instance state
  private _port!: number;

  private _gc = false;

  private controllers: Class[] = [];

  // Microservice transports collected from the transport() config hook
  private microserviceTransports: Map<string, MicroserviceTransport> = new Map();

  private messagingInterceptors: MessagingInterceptor[] = [];

  // Optional health endpoint (mainly for headless deployments / K8s probes)
  private _health?: HealthOptions;

  private healthServer?: HealthServer;

  private _shutdown?: ShutdownOptions;

  private _keepAlive?: boolean;

  // The shutdown, once started. Set for the life of the instance rather than for the duration
  // of the teardown, so it answers both a concurrent stop() and a later one.
  private stopping?: Promise<void>;

  private signalHandlers = new Map<NodeJS.Signals, () => void>();

  private unhandledErrorHandler?: (error: unknown) => void;

  // Headless processes have no listening socket to hold the event loop open, so a worker whose
  // @OnStart returned would otherwise exit the moment start() resolved.
  private keepAliveTimer?: Timer;

  // The Bun server returned by the adapter - exposes the actually bound port, which is
  // what a caller needs when starting on port 0 or on a unix socket
  private _httpServer?: bun.Server<any>;

  /**
   * @description Lifecycle hook - called after dependencies are injected
   * @returns {void}
   */
  @PostConstruct()
  public onInit(): void {
    this._logger.info(`${blue('[AsenaServer]')} is initialized`);
  }

  /**
   * @description Start the server
   * Main entry point after factory creation
   * @param {AsenaStartOptions} options - Optional transport overrides forwarded to the adapter
   * @returns {Promise<void>}
   */
  public async start(options?: AsenaStartOptions): Promise<void> {
    await this.resolveAdapter();

    if (this._adapter) {
      this._logger.info(`Adapter: ${green(this._adapter.name)} implemented`);
      this._adapter.setPort(this._port);
    } else {
      this._logger.info('Headless mode: no HTTP adapter configured');
      this.warnAdapterlessComponents();
    }

    // Runs here rather than during the scan: statements between create() and start()
    // in the entry file have executed by now, so a component declared below the
    // bootstrap call is visible and can be reported instead of silently missing
    this._iocEngine.warnAboutLateEntryComponents();

    this._logger.info('All components registered and ready to use');

    // Phase 7: Application setup
    this._coreContainer.setPhase(CoreBootstrapPhase.APPLICATION_SETUP);
    await this.prepareConfigs();
    await this.prepareMicroservices();
    await this.prepareEventService.prepare();
    await this.prepareScheduleService.prepare();

    if (this._adapter) {
      await this.initializeControllers();
      await this.prepareFrontendControllers();
      await this.prepareWebSocket();
    }

    // Component start hooks. Deliberately here and not earlier: the transports are connected
    // and listening by now, so a hook may publish through ulak - and deliberately not later,
    // because the socket is still closed, so no request can reach a component whose @OnStart
    // has not run.
    await this.lifecycleService.start();

    // Phase 8: Server ready
    this._coreContainer.setPhase(CoreBootstrapPhase.SERVER_READY);

    if (this._adapter) {
      this._httpServer = await this._adapter.start(options);
    }

    // Start scheduled jobs after server is ready
    this.cronRunner.startAll();

    if (this._health) {
      this.healthServer = new HealthServer(this._health, this._ulak, this._logger, () => this.lifecycleService.state);
      this.healthServer.start();
    }

    this.installShutdownHandlers();
    this.installKeepAlive();

    if (this._gc) {
      bun.gc(true);
    }
  }

  /**
   * @description Stop the server and release resources
   *
   * The order is what makes a shutdown graceful rather than merely quick:
   * 1. stop taking new work - cron, health, then the HTTP surface
   * 2. run the components' @OnStop hooks, so they can finish in flight work and publish a last
   *    message while the transports are still up
   * 3. only then take the transports down
   *
   * Runs once. Concurrent callers await the same teardown, and a later call is a no-op that
   * returns the original outcome - including its failure, if it had one. Every step was
   * attempted the first time, so there is nothing a retry could pick up.
   *
   * Safe on a server that never started. Note the rule is per component and not "nothing runs":
   * a component whose start hook already ran gets its stop hook, and post-processors (with the
   * closure they depend on) run theirs at construction. So a boot that failed before `start()`
   * still releases what a post-processor acquired - which is the point, since that is where the
   * telemetry providers live.
   *
   * @param {boolean | AsenaStopOptions} options - Legacy boolean is `closeActiveConnections`
   * @returns {Promise<void>}
   */
  public async stop(options: boolean | AsenaStopOptions = true): Promise<void> {
    const {
      closeActiveConnections = true,
      drainTimeout,
      hookTimeout,
    } = typeof options === 'boolean' ? { closeActiveConnections: options } : options;

    // Latched, not cleared when the teardown settles. Clearing it would make this a guard
    // against *concurrent* stops only, and a later sequential stop() would walk the whole
    // sequence again: the component hooks would correctly find nothing to do, but the adapter,
    // the cron runner and the transports are not self-guarding, so a stopped server would stop
    // itself a second time and log a second round of teardown errors.
    this.stopping ??= this.runStop(closeActiveConnections, drainTimeout, hookTimeout);

    return this.stopping;
  }

  /**
   * @description The shutdown sequence itself, wrapped by stop()'s idempotence guard.
   * @param {boolean} closeActiveConnections - Whether to close active connections immediately
   * @param {number | undefined} drainTimeout - How long transports may drain
   * @param {number | undefined} hookTimeout - Per-@OnStop ceiling
   * @returns {Promise<void>}
   */
  private async runStop(closeActiveConnections: boolean, drainTimeout?: number, hookTimeout?: number): Promise<void> {
    this.removeShutdownHandlers();
    this.clearKeepAlive();

    // First thing, before anything is torn down: the readiness probe has to start answering
    // 503 while there is still something to drain, or a load balancer keeps sending traffic
    // right up to the moment the socket closes.
    this.lifecycleService.markStopping();

    // Every step is contained, for the same reason a failing @OnStop hook does not abort the
    // rest: the steps are independent, and an adapter that cannot close its socket is no reason
    // to leave a database pool, a cron timer and a broker subscription behind it. Failures are
    // collected and raised together at the end, so a caller still learns the shutdown was not
    // clean - it just learns it after everything that could be released has been.
    const failures: Error[] = [];

    const release = async (step: string, run: () => unknown): Promise<void> => {
      try {
        await run();
      } catch (error) {
        this._logger.error(`${yellow('[AsenaServer]')} ${step} failed during shutdown: ${describeError(error)}`);
        failures.push(error instanceof Error ? error : new Error(`${step}: ${describeError(error)}`));
      }
    };

    await release('cron runner', () => this.cronRunner.stopAll());
    // Adapter before the hooks: in-flight HTTP handlers may still call ulak.send(), so
    // transports must outlive the HTTP surface that uses them
    await release('adapter', () => this._adapter?.stop(closeActiveConnections));

    await release('component stop hooks', () => this.lifecycleService.stop(hookTimeout ?? this._shutdown?.timeout));

    await release('microservice transports', () =>
      this.prepareMicroserviceService.destroy(drainTimeout === undefined ? undefined : { drainTimeout }),
    );

    await release('ulak', () => this._ulak.dispose());

    // Last: the probe outlives the drain it is reporting on.
    await release('health server', () => this.healthServer?.stop());

    if (failures.length > 0) {
      throw new AggregateError(failures, `Server shutdown completed with ${failures.length} failure(s)`);
    }
  }

  /**
   * @description Configure server port
   * Builder pattern for API compatibility
   * @param {number} port - Port number
   * @returns {this}
   */
  public port(port: number): this {
    this._port = port;
    return this;
  }

  /**
   * @description Configure the optional health endpoint (mainly for headless/K8s probes)
   * Builder pattern for API compatibility
   * @param {HealthOptions} options - Health endpoint options
   * @returns {this}
   */
  public health(options: HealthOptions): this {
    this._health = options;
    return this;
  }

  /**
   * @description Configure signal handling and shutdown timeouts
   * Builder pattern for API compatibility
   * @param {ShutdownOptions} options - Shutdown options
   * @returns {this}
   */
  public shutdown(options: ShutdownOptions): this {
    this._shutdown = options;
    return this;
  }

  /**
   * @description Hold the event loop open while the server runs
   * Builder pattern for API compatibility
   * @param {boolean} enabled - Defaults to true in headless mode, false otherwise
   * @returns {this}
   */
  public keepAlive(enabled: boolean): this {
    this._keepAlive = enabled;
    return this;
  }

  /**
   * @description Resolve a component from the container by name.
   *
   * The same signature the test harness exposes as `app.resolve()`. Reaching through
   * `server.coreContainer.container.resolve()` worked and was what everybody found instead.
   *
   * @param {string} name - Component name
   * @returns {Promise<T>} The component
   */
  public async resolve<T>(name: string): Promise<T> {
    return (await this._coreContainer.container.resolve<T>(name)) as T;
  }

  /**
   * @description Translate process signals into a graceful shutdown.
   *
   * Handlers are installed here rather than at construction so a server that is created but
   * never started leaves the process's signal handling alone, and they are removed again in
   * stop() so a suite that boots twenty servers does not accumulate twenty listeners - the
   * leak the otel package's own SIGTERM hook has today.
   *
   * @returns {void}
   */
  private installShutdownHandlers(): void {
    for (const signal of this.resolveSignals()) {
      const handler = (): void => this.onShutdownSignal(signal);

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    if (this._shutdown?.onUnhandledError) {
      this.unhandledErrorHandler = (error: unknown): void => {
        this._logger.error(`${yellow('[AsenaServer]')} unhandled error, shutting down: ${describeError(error)}`);
        this.shutdownThenExit(1);
      };

      process.on('uncaughtException', this.unhandledErrorHandler);
      process.on('unhandledRejection', this.unhandledErrorHandler);
    }
  }

  /**
   * @description Which signals to listen for.
   * @returns {NodeJS.Signals[]} Empty when signal handling is switched off
   */
  private resolveSignals(): NodeJS.Signals[] {
    const configured = this._shutdown?.signals ?? true;

    if (configured === false) {
      return [];
    }

    return configured === true ? ['SIGTERM', 'SIGINT', 'SIGHUP'] : configured;
  }

  /**
   * @description Remove every handler installed by installShutdownHandlers().
   * @returns {void}
   */
  private removeShutdownHandlers(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }

    this.signalHandlers.clear();

    if (this.unhandledErrorHandler) {
      process.off('uncaughtException', this.unhandledErrorHandler);
      process.off('unhandledRejection', this.unhandledErrorHandler);
      this.unhandledErrorHandler = undefined;
    }
  }

  /**
   * @description React to a shutdown signal.
   *
   * A second signal while a shutdown is already running is a person pressing Ctrl+C again
   * because the first one looked stuck; take them at their word and go.
   *
   * @param {NodeJS.Signals} signal - The signal received
   * @returns {void}
   */
  private onShutdownSignal(signal: NodeJS.Signals): void {
    if (this.stopping !== undefined) {
      this._logger.warn(`${yellow('[AsenaServer]')} ${signal} received again, exiting immediately`);
      process.exit(130);
    }

    this._logger.info(`${blue('[AsenaServer]')} ${signal} received, shutting down`);
    this.shutdownThenExit(0);
  }

  /**
   * @description Run the stop sequence, then let the process go.
   *
   * Note the `void`: an async function handed straight to `process.on` returns a promise
   * nobody holds, so a rejection inside it takes the process down with an unhandled rejection -
   * exactly how a telemetry flush against an unreachable collector turns Ctrl+C into exit 1.
   *
   * @param {number} code - Exit code when a force-exit deadline is configured
   * @returns {void}
   */
  private shutdownThenExit(code: number): void {
    const forceExitAfter = this._shutdown?.forceExitAfter ?? false;
    let forceTimer: Timer | undefined;

    if (typeof forceExitAfter === 'number') {
      forceTimer = setTimeout(() => {
        this._logger.error(`${yellow('[AsenaServer]')} still alive ${forceExitAfter}ms after shutdown, forcing exit`);
        process.exit(code === 0 ? 1 : code);
      }, forceExitAfter);

      // Unref'd, and deliberately never cleared: the deadline is about the *process* exiting,
      // not about stop() resolving. The case worth protecting against is a stop() that finished
      // cleanly and left something ref'd behind anyway - a pool that never drained, a timer
      // nobody owns - because that process now hangs until the orchestrator SIGKILLs it.
      // Clearing this on stop() completing, which is what it used to do, made it fire only when
      // stop() itself hung: the one thing that can no longer happen, since every hook is
      // timeout-bounded and every teardown step is contained.
      //
      // Unref means a process that does exit on its own is unaffected - the timer cannot be
      // what keeps it alive, and never delays a clean exit.
      forceTimer.unref?.();
    }

    void this.stop()
      .catch((error: unknown) => {
        this._logger.error(`${yellow('[AsenaServer]')} shutdown failed: ${describeError(error)}`);
      })
      .finally(() => {
        if (code !== 0) {
          process.exit(code);
        }
      });
  }

  /**
   * @description Hold the event loop open for a headless server.
   *
   * A headless process has no listening socket, so once start() resolves there may be nothing
   * ref'd left and bun exits - taking a perfectly healthy worker with it. The alternative was
   * for the entry file to block on the component's own loop, which is what made the run loop
   * live in the entry file's stack frame.
   *
   * @returns {void}
   */
  private installKeepAlive(): void {
    const enabled = this._keepAlive ?? !this._adapter;

    if (!enabled || this.keepAliveTimer) {
      return;
    }

    // A ref'd timer with nothing to do: the only portable way to hold bun's event loop open
    // without opening a handle we would then have to own.
    this.keepAliveTimer = setInterval(() => undefined, 2 ** 30);
  }

  /**
   * @description Release the keep-alive handle so the process can exit.
   * @returns {void}
   */
  private clearKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  /**
   * @description Lazily resolve the HTTP adapter if one was registered.
   * Headless mode (no adapter) is valid - all adapter-dependent steps are skipped.
   * @returns {Promise<void>}
   */
  private async resolveAdapter(): Promise<void> {
    if (this._adapter) {
      return;
    }

    if (this._coreContainer.container.has(ICoreServiceNames.ASENA_ADAPTER)) {
      this._adapter = await this._coreContainer.resolve<A>(ICoreServiceNames.ASENA_ADAPTER);
    }
  }

  /**
   * @description Warn about HTTP-only components that cannot work without an adapter
   * @returns {void}
   */
  private warnAdapterlessComponents(): void {
    const httpOnlyTypes = [ComponentType.CONTROLLER, ComponentType.WEBSOCKET, ComponentType.FRONTEND_CONTROLLER];

    const services = this._coreContainer.container.services;

    for (const type of httpOnlyTypes) {
      const names: string[] = [];

      for (const value of Object.values(services)) {
        const entries = Array.isArray(value) ? value : [value];

        for (const entry of entries) {
          // Own-only, like every other component-type read in the framework. Off the chain a
          // @Service extending a @Controller was named here as an HTTP-only component that would
          // "be ignored" - while being registered and working perfectly.
          if (entry?.Class && getOwnTypedMetadata<boolean>(type, entry.Class)) {
            names.push(entry.Class.name);
          }
        }
      }

      if (names.length) {
        this._logger.warn(
          `Headless mode: ${type} component(s) [${names.join(', ')}] require an HTTP adapter and will be ignored`,
        );
      }
    }
  }

  /**
   * @description Get current CoreContainer instance
   * @returns {CoreContainer}
   */
  public get coreContainer(): CoreContainer {
    return this._coreContainer;
  }

  /**
   * @description The Bun server the adapter is listening on, once start() has run.
   *
   * Undefined in headless mode and before start(). Read `httpServer.port` to learn the
   * actually bound port - the only way to find it out when starting on port 0.
   * @returns {bun.Server | undefined}
   */
  public get httpServer(): bun.Server<any> | undefined {
    return this._httpServer;
  }

  /**
   * @description Initialize and register all controllers
   * @returns {Promise<void>}
   */
  private async initializeControllers(): Promise<void> {
    await this.validateAndSetControllers();

    const registeredRoutes = new Map<string, { controllerName: string; handlerName: string }>();

    for (const controller of this.controllers) {
      // Chained: a @Get declared on a base class is written to that base class, so reading
      // own metadata only would drop it. Merged ancestors-first, so a subclass overrides an
      // inherited route by method name.
      const routes = getChainedTypedMetadata<Route>(ComponentConstants.RouteKey, controller.constructor);

      // PathKey stays own-only on purpose: it is written by @Controller onto the class it
      // decorates, which is always the concrete subclass, so inherited routes correctly pick
      // up the subclass's prefix.
      const routePath: string = getOwnTypedMetadata<string>(ComponentConstants.PathKey, controller.constructor) || '';

      this.logInheritedRoutes(controller, routes);

      await this.prepareTopMiddlewares({ controller, routePath });

      for (const [name, params] of Object.entries(routes)) {
        const lastPath = path.join(`${routePath}/`, params.path).replace(/\\/g, '/');
        const controllerName =
          getTypedMetadata<string>(ComponentConstants.NameKey, controller.constructor) || 'Unknown';

        this.checkDuplicateRoute(registeredRoutes, params.method, lastPath, controllerName, name);

        const middlewares = await this.prepareRouteMiddleware(params);
        const validatorInstance = await this.prepareValidator(params.validator);

        await this._adapter.registerRoute({
          method: params.method,
          path: lastPath,
          middlewares: middlewares,
          handler: controller[name].bind(controller),
          staticServe: await this.prepareStaticServeConfig(params.staticServe),
          validator: validatorInstance,
          controllerName,
          controllerBasePath: routePath,
        });
      }
    }
  }

  /**
   * @description Report routes a controller picked up from its base classes
   *
   * Inheriting routes is supported, but it is invisible in the source of the controller you
   * are looking at - so the resolved set is logged once per controller. Silent when the
   * controller declares everything itself, which is the common case.
   * @param {any} controller - The resolved controller instance
   * @param {Route} routes - The merged route map for that controller
   * @returns {void}
   */
  private logInheritedRoutes(controller: any, routes: Route): void {
    const ownRoutes = getOwnTypedMetadata<Route>(ComponentConstants.RouteKey, controller.constructor) || {};
    const inherited = Object.keys(routes).filter((handlerName) => !(handlerName in ownRoutes));

    if (inherited.length === 0) {
      return;
    }

    const controllerName =
      getTypedMetadata<string>(ComponentConstants.NameKey, controller.constructor) || controller.constructor.name;

    this._logger.info(`Controller ${yellow(controllerName)} inherits routes: ${inherited.join(', ')}`);
  }

  /**
   * @description Check for duplicate route registration and throw if found
   */
  private checkDuplicateRoute(
    registeredRoutes: Map<string, { controllerName: string; handlerName: string }>,
    method: string,
    fullPath: string,
    controllerName: string,
    handlerName: string,
  ): void {
    const routeKey = `${method.toUpperCase()} ${fullPath}`;

    // Check for exact duplicate (same method + path)
    const existing = registeredRoutes.get(routeKey);

    if (existing) {
      throw new Error(
        `Duplicate route detected: ${routeKey} — ` +
          `already registered by ${existing.controllerName}.${existing.handlerName}(), ` +
          `conflicts with ${controllerName}.${handlerName}()`,
      );
    }

    // Check ALL conflicts: if new route is ALL, check if any method already registered for this path
    if (method.toUpperCase() === 'ALL') {
      for (const [key, entry] of registeredRoutes) {
        if (key.endsWith(` ${fullPath}`)) {
          throw new Error(
            `Duplicate route detected: ALL ${fullPath} conflicts with ${key} — ` +
              `already registered by ${entry.controllerName}.${entry.handlerName}(), ` +
              `conflicts with ${controllerName}.${handlerName}()`,
          );
        }
      }
    }

    // Check if ALL already registered for this path and new route conflicts
    const allKey = `ALL ${fullPath}`;
    const allEntry = registeredRoutes.get(allKey);

    if (allEntry && method.toUpperCase() !== 'ALL') {
      throw new Error(
        `Duplicate route detected: ${routeKey} conflicts with ALL ${fullPath} — ` +
          `already registered by ${allEntry.controllerName}.${allEntry.handlerName}(), ` +
          `conflicts with ${controllerName}.${handlerName}()`,
      );
    }

    registeredRoutes.set(routeKey, { controllerName, handlerName });
  }

  /**
   * @description Validate and set controllers from container
   * @returns {Promise<void>}
   */
  private async validateAndSetControllers(): Promise<void> {
    const controllers = await this._coreContainer.container.resolveAll<Class>(ComponentType.CONTROLLER);

    if (controllers !== null) {
      // check if any controller is array or not
      if (controllers.find((controller) => Array.isArray(controller))) {
        throw new Error('Controller cannot be array');
      }

      this.controllers = controllers as Class[];
    }
  }

  /**
   * @description Prepare static serve configuration
   * @param {StaticServeClass} staticServeClass - Static serve class
   * @returns {Promise<BaseStaticServeParams>}
   */
  private async prepareStaticServeConfig(staticServeClass: StaticServeClass): Promise<BaseStaticServeParams> {
    return await this.prepareStaticServeConfigService.prepare(staticServeClass);
  }

  /**
   * @description Prepare top-level middlewares for controller or websocket
   * @param {PrepareMiddlewareParams} params - Middleware parameters
   * @param {boolean} websocket - Whether this is for websocket
   * @returns {Promise<BaseMiddleware[]>}
   */
  private async prepareTopMiddlewares(
    { controller, routePath }: PrepareMiddlewareParams,
    websocket = false,
  ): Promise<BaseMiddleware[]> {
    // Unioned across the chain, not read own-only. @Controller always writes this key - an
    // empty array when no middlewares are declared - so a subclass would otherwise shadow its
    // base's guards while still inheriting the base's routes: the route registers, the guard
    // does not. A subclass may add middlewares; it can never silently drop an inherited one.
    const topMiddlewares = getChainedTypedMetadataList<MiddlewareClass>(
      ComponentConstants.MiddlewaresKey,
      controller.constructor,
    );

    const middlewares = await this.prepareMiddlewares(topMiddlewares);

    if (websocket) {
      return middlewares;
    }

    // Register controller-level middlewares with pattern matching
    // Convert routePath to pattern: /api → /api/*
    const routePattern = routePath ? `${routePath}/*` : undefined;

    for (const middleware of middlewares) {
      await this._adapter.use(middleware, routePattern ? { include: [routePattern] } : undefined);
    }
  }

  /**
   * @description Prepare validator instance
   * @param {ValidatorClass<any>} Validator - Validator class
   * @returns {Promise<BaseValidator>}
   */
  private async prepareValidator(Validator: ValidatorClass<any>): Promise<BaseValidator> {
    return await this.prepareValidatorService.prepare(Validator);
  }

  /**
   * @description Prepare route-level middlewares
   * @param {ApiParams} middlewareParams - Middleware parameters
   * @returns {Promise<BaseMiddleware[]>}
   */
  private async prepareRouteMiddleware(middlewareParams: ApiParams): Promise<BaseMiddleware[]> {
    const routeMiddlewares = middlewareParams?.middlewares || [];

    return this.prepareMiddlewares(routeMiddlewares);
  }

  /**
   * @description Prepare middlewares from classes
   * @param {MiddlewareClass[]} middlewares - Middleware classes
   * @returns {Promise<BaseMiddleware[]>}
   */
  private async prepareMiddlewares(middlewares: MiddlewareClass[]): Promise<BaseMiddleware[]> {
    return this.prepareMiddleware.prepare(middlewares);
  }

  /**
   * @description Prepare and register FrontendController HTML routes
   * @returns {Promise<void>}
   */
  private async prepareFrontendControllers(): Promise<void> {
    const htmlRoutes = await this.prepareFrontendControllerService.prepare();

    if (!htmlRoutes.length) {
      return;
    }

    for (const route of htmlRoutes) {
      this._adapter.registerHTMLRoute(route.path, route.htmlBundle, route.controllerName, route.controllerBasePath);
    }
  }

  /**
   * @description Prepare and register WebSocket routes
   * @returns {Promise<void>}
   */
  private async prepareWebSocket(): Promise<void> {
    const websockets = await this.prepareWebsocketService.prepare();

    if (!websockets) {
      return;
    }

    for (const websocket of websockets) {
      // Own-only, to agree with PrepareWebsocketService, which reads the same key off the same
      // class four lines earlier in the boot. When the two disagreed the halves desynced: the
      // route mounted at the base's path while `namespace` stayed undefined, so the adapter
      // rejected it with a message pointing at a class the user never wrote.
      const path = getOwnTypedMetadata<string>(ComponentConstants.PathKey, websocket.constructor);
      const middlewares = await this.prepareTopMiddlewares({ controller: websocket as unknown as Class }, true);

      await this._adapter.registerWebsocketRoute({
        path: path,
        middlewares: middlewares,
        websocketService: websocket,
        controllerName: getTypedMetadata<string>(ComponentConstants.NameKey, websocket.constructor),
      });
    }
  }

  /**
   * @description Normalizes global middleware entry to config format
   * Handles backward compatibility (MiddlewareClass → GlobalMiddlewareConfig)
   *
   * @param entry - Middleware entry (class or config object)
   * @returns Normalized config object
   */
  private normalizeMiddlewareEntry(entry: GlobalMiddlewareEntry): GlobalMiddlewareConfig {
    // If it's already a config object, return as-is
    if (typeof entry === 'object' && 'middleware' in entry) {
      return entry;
    }

    // If it's a class (old format), convert to config format
    return {
      middleware: entry,
      routes: undefined, // No route config = apply to all routes
    };
  }

  /**
   * @description Warn about @Config members the framework will never read
   *
   * Hooks are looked up reflectively, so a member with the right intent but the wrong name
   * or shape is a silent no-op: the server starts, logs nothing, and the middleware or
   * handler simply never runs. Type checking cannot catch either case - an extra property
   * on a subclass is always legal - so they are reported here instead.
   * @param {object} configInstance - The resolved @Config instance
   * @returns {void}
   */
  private warnOnIgnoredConfigMembers(configInstance: object): void {
    const members = configInstance as Record<string, unknown>;

    for (const [alias, hook] of Object.entries(ASENA_CONFIG_HOOK_ALIASES)) {
      if (Array.isArray(members[alias])) {
        this._logger.warn(
          `Config has a '${alias}' property, but only ${hook}() is read - move it to ${hook}() { return [...]; } or it will never be applied`,
        );
      }
    }

    for (const hook of ASENA_CONFIG_FUNCTIONS) {
      const value = members[hook];

      if (value !== undefined && typeof value !== 'function') {
        this._logger.warn(
          `Config '${hook}' is a ${typeof value}, not a method - it is ignored. Declare it as ${hook}() { ... }`,
        );
      }
    }
  }

  /**
   * @description Prepare and apply configuration
   * Updated to support pattern-based global middlewares
   * @returns {Promise<void>}
   */
  private async prepareConfigs(): Promise<void> {
    const configInstance = await this.prepareConfigService.prepare();

    if (!configInstance) {
      return;
    }

    this.warnOnIgnoredConfigMembers(configInstance);

    if (typeof configInstance.serveOptions === 'function') {
      if (this._adapter) {
        await this._adapter.serveOptions(configInstance.serveOptions.bind(configInstance));
      } else {
        this._logger.warn('Headless mode: serveOptions() ignored (no HTTP adapter)');
      }
    }

    if (typeof configInstance.onError === 'function') {
      if (this._adapter) {
        await this._adapter.onError(configInstance.onError.bind(configInstance));
      } else {
        this._logger.warn('Headless mode: onError() ignored (no HTTP adapter)');
      }
    }

    if (typeof configInstance.onNotFound === 'function') {
      if (!this._adapter) {
        this._logger.warn('Headless mode: onNotFound() ignored (no HTTP adapter)');
      } else if (typeof this._adapter.onNotFound !== 'function') {
        // The hook is optional on AsenaAdapter so third-party adapters keep compiling. Say so
        // rather than letting a declared handler silently never run.
        this._logger.warn(
          `Config declares onNotFound(), but adapter '${this._adapter.name}' does not support it - ` +
            'unmatched routes will use the adapter default',
        );
      } else {
        await this._adapter.onNotFound(configInstance.onNotFound.bind(configInstance));
      }
    }

    // Pattern-based global middleware registration
    if (typeof configInstance.globalMiddlewares === 'function') {
      if (this._adapter) {
        const middlewareEntries = await configInstance.globalMiddlewares();

        for (const entry of middlewareEntries) {
          // Normalize entry to config format (handles backward compatibility)
          const config = this.normalizeMiddlewareEntry(entry);

          // Prepare middleware instances
          const preparedMiddlewares = await this.prepareMiddlewares([config.middleware]);

          // Register with adapter (pass route config)
          for (const middleware of preparedMiddlewares) {
            await this._adapter.use(middleware, config.routes);
          }
        }
      } else {
        this._logger.warn('Headless mode: globalMiddlewares() ignored (no HTTP adapter)');
      }
    }

    // Transport configuration (WebSocket + microservice)
    if (typeof configInstance.transport === 'function') {
      const result = await configInstance.transport();
      const normalized = await normalizeTransportConfig(result);

      if (normalized.websocket) {
        if (this._adapter) {
          const wsAdapter = this._adapter.getWebsocketAdapter();

          if (wsAdapter) {
            wsAdapter.transport = normalized.websocket;
          }
        } else {
          this._logger.warn('Headless mode: websocket transport ignored (no HTTP adapter)');
        }
      }

      // Microservice part works in BOTH modes - consumed by prepareMicroservices()
      this.microserviceTransports = normalized.microservices;
      this.messagingInterceptors = normalized.interceptors;
    }

    const name = getOwnTypedMetadata<string>(ComponentConstants.NameKey, configInstance.constructor);

    this._logger.info(`Config ${yellow(name)} applied`);
  }

  /**
   * @description Prepare microservice message handlers and transports
   * Runs before the HTTP adapter starts so handlers are live before HTTP goes up.
   * Also validates that @MessageController components have a configured transport (fail fast).
   * @returns {Promise<void>}
   */
  private async prepareMicroservices(): Promise<void> {
    await this.prepareMicroserviceService.prepare(this.microserviceTransports, this.messagingInterceptors);
  }
}
