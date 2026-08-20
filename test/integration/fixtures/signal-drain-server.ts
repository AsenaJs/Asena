/**
 * An HTTP fixture for the signal-drain test: a real Bun.serve behind the real signal path.
 *
 * Core ships no HTTP adapter of its own, so the fixture carries the smallest one that behaves
 * like the real ones - `stop(false)` stops listening and waits for the request in flight. The
 * guarantee under test is core's, not the adapter's: a SIGTERM must stop() with drain rather
 * than force-close, through any adapter that forwards the flag to Bun.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaAdapter } from '../../../lib/adapter';
import type { RouteParams } from '../../../lib/adapter';
import type { ServerLogger } from '../../../lib/logger';
import { AsenaServerFactory } from '../../../lib/server';
import { Controller } from '../../../lib/server/decorators';
import { Get } from '../../../lib/server/web/decorators';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

class DrainFixtureAdapter extends AsenaAdapter<any, any> {
  public readonly name = 'drain-fixture';

  private routes = new Map<string, RouteParams<any, any>>();

  private server?: Bun.Server;

  public constructor(logger: ServerLogger) {
    super(logger);
  }

  public setPort(port: number): void {
    this.port = port;
  }

  public registerRoute(params: RouteParams<any, any>): void {
    // Route metadata stores the method lowercase; normalize both sides so the
    // fixture's lookup keys agree with what fetch reports
    const key = `${params.method.toUpperCase()} ${params.path.replace(/\/+$/, '') || '/'}`;

    this.routes.set(key, params);
  }

  public async start(): Promise<Bun.Server> {
    this.server = Bun.serve({
      port: this.port,
      fetch: async (request) => {
        const { pathname } = new URL(request.url);

        const route = this.routes.get(`${request.method} ${pathname.replace(/\/+$/, '') || '/'}`);

        if (!route) return new Response('not found', { status: 404 });

        return new Response(String(await route.handler()));
      },
    });

    return this.server;
  }

  public async stop(closeActiveConnections = true): Promise<void> {
    this.server?.stop(closeActiveConnections);
    this.server = undefined;
  }

  public use(): void {}

  public registerHTMLRoute(): void {}

  public registerWebsocketRoute(): void {}

  public onError(): void {}

  public serveOptions(): void {}
}

const SLOW_MS = 800;

@Controller('/slow')
class SlowController {
  @Get({ path: '/' })
  public async slow(): Promise<string> {
    await Bun.sleep(SLOW_MS);
    return 'drained';
  }
}

const server = await AsenaServerFactory.create({
  adapter: new DrainFixtureAdapter(silentLogger),
  logger: silentLogger,
  port: 0,
  components: [SlowController],
});

await server.start();

console.log(`SERVER_STARTED port=${server.httpServer!.port} slowMs=${SLOW_MS}`);
