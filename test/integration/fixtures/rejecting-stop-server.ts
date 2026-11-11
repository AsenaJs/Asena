/**
 * A server whose adapter fails to close, so stop() rejects, run as a real process by
 * GracefulShutdown.test.ts. Errors go to stdout because the test asserts the failure was logged.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { AsenaAdapter } from '../../../lib/adapter';
import type { ServerLogger } from '../../../lib/logger';
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';

const logger: ServerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: (message: string) => console.log(`LOGGED_ERROR ${message}`),
  profile: () => undefined,
};

class UnclosableAdapter extends AsenaAdapter<any, any> {
  public readonly name = 'unclosable-fixture';

  private server?: Bun.Server<any>;

  public constructor(serverLogger: ServerLogger) {
    super(serverLogger);
  }

  public setPort(port: number): void {
    this.port = port;
  }

  public registerRoute(): void {}

  public async start(): Promise<Bun.Server<any>> {
    this.server = Bun.serve({ port: this.port, fetch: () => new Response('ok') });

    return this.server;
  }

  public async stop(): Promise<void> {
    this.server?.stop(true);

    throw new Error('socket refused to close');
  }

  public use(): void {}

  public registerHTMLRoute(): void {}

  public registerWebsocketRoute(): void {}

  public onError(): void {}

  public serveOptions(): void {}
}

@Service()
class Bystander {}

const server = await AsenaServerFactory.create({
  adapter: new UnclosableAdapter(logger),
  logger,
  port: 0,
  components: [Bystander],
});

await server.start();

console.log('SERVER_STARTED');
