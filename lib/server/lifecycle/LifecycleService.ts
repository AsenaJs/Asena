import { CoreService, ICoreServiceNames } from '../../ioc';
import type { Container, ICoreService, LifecycleComponent } from '../../ioc';
import { Inject } from '../../ioc/component';
import type { ServerLogger } from '../../logger';
import { LifecycleState } from './LifecycleState';

/** Per-hook ceiling when none is configured. */
const DEFAULT_HOOK_TIMEOUT = 5000;

/**
 * @description LifecycleService - runs component start and stop hooks around the server.
 *
 * The container used to run `@PostConstruct` inside `register()`, which put a component's
 * initialisation in the middle of the scan: the graph was half-built, the microservice
 * transports did not exist yet, and there was no counterpart to release what the hook had
 * acquired. Every framework package that opened a connection - database, redis, kafka, otel -
 * therefore leaked it past `server.stop()`.
 *
 * Both halves now live here, and they are symmetric:
 * - start walks the components in registration order, so dependencies start first
 * - stop walks them backwards, so a component still has its dependencies while it lets go
 *
 * The two failure policies are deliberately different. A start hook that throws aborts the
 * boot - a half-initialised application should not serve traffic - and the components that
 * already started are rolled back first. A stop hook that throws or hangs is logged and
 * skipped, because a shutdown that gives up halfway leaves more behind than one that limps to
 * the end.
 *
 * @internal Driven by AsenaServer.start()/stop(), not used directly by users
 */
@CoreService(ICoreServiceNames.LIFECYCLE_SERVICE)
export class LifecycleService implements ICoreService {
  public readonly serviceName = 'LifecycleService';

  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger!: ServerLogger;

  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  private _state: LifecycleState = LifecycleState.NEW;

  public get state(): LifecycleState {
    return this._state;
  }

  /**
   * @description Run every pending start hook, in registration order.
   *
   * Components registered in immediate mode - core services and the post-processor closure -
   * ran theirs at construction and are skipped here.
   *
   * @returns {Promise<void>}
   * @throws When a hook fails, after rolling back the components that already started
   */
  public async start(): Promise<void> {
    this._state = LifecycleState.STARTING;

    const components = this.container.lifecycle;
    let started = 0;

    for (const component of components) {
      if (component.started) continue;

      try {
        await this.container.executeStartHooks(component.instance, component.Class);
        // Set after the hooks succeed, and regardless of whether the class declared any: it is
        // what makes the component eligible for its stop hooks, and a component with only an
        // @OnStop still has something to release.
        component.started = true;
        started++;
      } catch (error) {
        this._state = LifecycleState.FAILED;

        this.logger.error(
          `[Lifecycle] ${component.key} failed to start - rolling back ${started} started component(s)`,
        );

        await this.stopComponents(components, DEFAULT_HOOK_TIMEOUT);

        throw error;
      }
    }

    this._state = LifecycleState.STARTED;

    if (started > 0) {
      this.logger.debug?.(`[Lifecycle] started ${started} component(s)`);
    }
  }

  /**
   * @description Run stop hooks for everything that started, in reverse order.
   *
   * Safe to call on a server that never started, or that failed during boot: the components
   * that never ran their start hooks are skipped, so nothing gets torn down that was never
   * brought up. Safe to call twice - a stopped component is not stopped again.
   *
   * @param {number} hookTimeout - Per-hook ceiling in milliseconds
   * @returns {Promise<void>}
   */
  public async stop(hookTimeout: number = DEFAULT_HOOK_TIMEOUT): Promise<void> {
    this.markStopping();

    const stopped = await this.stopComponents(this.container.lifecycle, hookTimeout);

    this._state = LifecycleState.STOPPED;

    if (stopped > 0) {
      this.logger.debug?.(`[Lifecycle] stopped ${stopped} component(s)`);
    }
  }

  /**
   * @description Flip to STOPPING before any teardown begins.
   *
   * Called at the very top of `server.stop()` so the readiness probe answers 503 for the whole
   * drain, not just for the instant between the hooks finishing and the process exiting. A load
   * balancer needs the signal while there is still something to drain.
   *
   * @returns {void}
   */
  public markStopping(): void {
    this._state = LifecycleState.STOPPING;
  }

  /**
   * @description Walk components backwards running their @OnStop hooks, containing every failure.
   * @param {LifecycleComponent[]} components - The registration-ordered list
   * @param {number} hookTimeout - Per-hook ceiling in milliseconds
   * @returns {Promise<number>} How many components were stopped
   */
  private async stopComponents(components: LifecycleComponent[], hookTimeout: number): Promise<number> {
    let stopped = 0;

    for (let index = components.length - 1; index >= 0; index--) {
      const component = components[index];

      if (!component.started) continue;

      // Cleared before the hooks run, not after: a hook that throws has already done whatever
      // part of its teardown it managed, and running it a second time on the next stop() would
      // be worse than skipping it.
      component.started = false;
      stopped++;

      for (const hook of this.container.getStopHooks(component.Class)) {
        const label = `${component.Class.name}.${hook}()`;

        try {
          await this.withTimeout(component.instance[hook](), hookTimeout, label);
        } catch (error) {
          this.logger.error(
            `[Lifecycle] @OnStop hook '${label}' failed, continuing shutdown: ${(error as Error).message}`,
          );
        }
      }
    }

    return stopped;
  }

  /**
   * @description Bound wait on a hook.
   *
   * A hook that never settles would otherwise hold the process open forever - the exact failure
   * a graceful shutdown is supposed to prevent. The timer is always cleared, including on the
   * happy path, so a fast shutdown is not held up by a pending timeout.
   *
   * @param {unknown} result - Whatever the hook returned
   * @param {number} ms - Ceiling in milliseconds
   * @param {string} label - Hook name for the error message
   * @returns {Promise<void>}
   */
  private async withTimeout(result: unknown, ms: number, label: string): Promise<void> {
    let timer: Timer | undefined;

    try {
      await Promise.race([
        Promise.resolve(result),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} did not finish within ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
