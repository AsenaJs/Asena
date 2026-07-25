import * as bun from 'bun';
import { blue, type ServerLogger } from '../../logger';
import type { HealthOptions } from '../AsenaServerFactory';
import type { Ulak } from '../messaging/Ulak';

/**
 * @description Minimal zero-dependency health endpoint for headless/hybrid deployments.
 *
 * Serves a single endpoint (default GET /healthz) reporting process liveness and
 * per-microservice-transport connection state - built for Kubernetes probes on
 * headless services that have no HTTP adapter.
 *
 * Responses:
 * - No microservice transports configured → 200 { status: 'up', uptime }
 * - All transports connected → 200 { status: 'up', uptime, transports: { name: 'connected' } }
 * - Any transport disconnected → 503 { status: 'degraded', ... }
 */
export class HealthServer {
  private server?: bun.Server<any>;

  private startedAt = 0;

  public constructor(
    private readonly options: HealthOptions,
    private readonly ulak: Ulak,
    private readonly logger: ServerLogger,
  ) {}

  public start(): void {
    const path = this.options.path || '/healthz';

    this.startedAt = Date.now();

    this.server = bun.serve({
      port: this.options.port,
      fetch: (request: Request) => {
        const url = new URL(request.url);

        if (url.pathname !== path) {
          return new Response('Not Found', { status: 404 });
        }

        return this.buildHealthResponse();
      },
    });

    this.logger.info(`${blue('[Health]')} Health endpoint ready at :${this.options.port}${path}`);
  }

  public stop(): void {
    void this.server?.stop(true);
    this.server = undefined;
  }

  private buildHealthResponse(): Response {
    const transports = this.ulak.getMicroserviceTransports();

    const uptime = Math.round((Date.now() - this.startedAt) / 1000);

    if (transports.size === 0) {
      return Response.json({ status: 'up', uptime });
    }

    const states: Record<string, 'connected' | 'disconnected'> = {};
    let degraded = false;

    for (const [name, transport] of transports) {
      const connected = transport.isConnected;

      states[name] = connected ? 'connected' : 'disconnected';

      if (!connected) {
        degraded = true;
      }
    }

    return Response.json(
      { status: degraded ? 'degraded' : 'up', uptime, transports: states },
      { status: degraded ? 503 : 200 },
    );
  }
}
