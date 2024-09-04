import type { AsenaAdapter } from '../AsenaAdapter.ts';
import { Hono } from 'hono';
import * as bun from 'bun';
import type { RouteParams } from '../types/routeParams.ts';

export class DefaultAdapter implements AsenaAdapter<Hono, any, any> {

  public app = new Hono();

  protected port: number;

  public setPort(port: number) {
    this.port = port;
  }

  public use(middleware: any) {
    this.app.use(middleware);
  }

  public registerRoute({ method, path, middleware, handler }: RouteParams<any, any>) {



  }

  public async start() {
    bun.serve({ port: this.port, fetch: this.app.fetch });
  }

}
