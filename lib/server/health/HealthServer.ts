import * as bun from 'bun';
import { blue, type ServerLogger } from '../../logger';
import type { HealthOptions } from '../AsenaServerFactory';
import type { Ulak } from '../messaging/Ulak';
import type { LifecycleState } from '../lifecycle';
import { computeReadiness } from './readiness';

/**
 * @description Minimal zero-dependency health endpoint for headless/hybrid deployments.
 *
 * Three paths, because liveness and readiness answer different questions and a probe that
 * conflates them restarts a pod that was only busy starting up:
 *
 * - `GET {path}/live` - is the process alive? Never touches a dependency, so it stays 200 for
 *   as long as the event loop turns. This is what a restart policy should point at.
 * - `GET {path}/ready` - should traffic come here? 503 while starting, while stopping, and
 *   whenever a microservice transport is disconnected.
 * - `GET {path}` - the original endpoint, same body as `/ready`, kept for compatibility.
 *
 * Ready reports 503 the moment shutdown begins, which is the point: a load balancer drops the
 * instance while it drains rather than after it has already stopped answering.
 */
export class HealthServer {
  private server?: bun.Server<any>;

  private startedAt = 0;

  public constructor(
    private readonly options: HealthOptions,
    private readonly ulak: Ulak,
    private readonly logger: ServerLogger,
    /** Reads the server's runtime state; absent in tests that only exercise transports. */
    private readonly lifecycleState?: () => LifecycleState,
  ) {}

  public start(): void {
    const path = this.options.path || '/healthz';

    this.startedAt = Date.now();

    this.server = bun.serve({
      port: this.options.port,
      fetch: (request: Request) => {
        const { pathname } = new URL(request.url);

        if (pathname === `${path}/live`) {
          return Response.json({ status: 'up', uptime: this.uptime() });
        }

        if (pathname === path || pathname === `${path}/ready`) {
          return this.buildReadinessResponse();
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    this.logger.info(`${blue('[Health]')} Health endpoint ready at :${this.options.port}${path} (+ /live, /ready)`);
  }

  public stop(): void {
    void this.server?.stop(true);
    this.server = undefined;
  }

  private uptime(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  private buildReadinessResponse(): Response {
    const uptime = this.uptime();
    const readiness = computeReadiness(this.lifecycleState?.(), this.ulak.getMicroserviceTransports());

    if (readiness.status === 'not_ready') {
      return Response.json({ status: readiness.status, state: readiness.state, uptime }, { status: 503 });
    }

    if (!('transports' in readiness)) {
      return Response.json({ status: readiness.status, uptime });
    }

    return Response.json(
      { status: readiness.status, uptime, transports: readiness.transports },
      { status: readiness.status === 'degraded' ? 503 : 200 },
    );
  }
}
