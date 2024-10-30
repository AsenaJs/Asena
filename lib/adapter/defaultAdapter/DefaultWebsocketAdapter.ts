import type { AsenaWebSocketService, WebSocketData, WSEvents, WSOptions } from '../../server/web/websocket';
import { AsenaWebsocketAdapter } from '../AsenaWebsocketAdapter';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import * as crypto from 'node:crypto';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../ioc/constants';

export class DefaultWebsocketAdapter extends AsenaWebsocketAdapter<Hono, MiddlewareHandler> {

  private _websocket: WebSocketHandler;

  private _server: Server;

  public constructor(app: Hono) {
    super();

    this.app = app;
  }

  public registerWebSocket(websocketHandlers: AsenaWebSocketService<any>, middlewares: MiddlewareHandler[]): void {
    if (this.websockets === undefined) {
      this.websockets = [];
    }

    websocketHandlers.namespace = getMetadata(ComponentConstants.PathKey, websocketHandlers.constructor);

    this.websockets.push({ socket: websocketHandlers, middlewares });
  }

  public prepareWebSocket(options?: WSOptions): void {
    this._websocket = {
      open: this.createHandler('onOpenInternal'),
      message: this.createHandler('onMessage'),
      drain: this.createHandler('onDrain'),
      close: this.createHandler('onCloseInternal'),
      ping: this.createHandler('onPing'),
      pong: this.createHandler('onPong'),
      ...options,
    };
  }

  public startWebSocket(): void {
    if (!this._websocket) return;

    for (const websocket of this.websockets) {
      this.upgradeWebSocket(websocket.socket, websocket.middlewares);
    }
  }

  public get websocket(): WebSocketHandler {
    return this._websocket;
  }

  // eslint-disable-next-line accessor-pairs

  public setServer(server: Server) {
    this._server = server;
  }

  private upgradeWebSocket(websocket: AsenaWebSocketService<any>, middlewares: MiddlewareHandler[]): void {
    const path = getMetadata(ComponentConstants.PathKey, websocket.constructor);

    this.app.get(`/${path}`, ...middlewares, async (c: Context, next) => {
      const websocketData = c.get('_websocketData') || {};

      const id = crypto.randomUUID();

      const data: WebSocketData = { values: websocketData, id, path: path };
      const upgradeResult = this._server.upgrade(c.req.raw, { data });

      if (upgradeResult) {
        return new Response(null);
      }

      await next(); // Failed
    });
  }

  private createHandler(type: keyof WSEvents) {
    return (ws: ServerWebSocket<WebSocketData>, ...args: any[]) => {
      const websocket = this.websockets.find((h) => {
        const path = h.socket.namespace;

        return path === ws.data.path;
      });

      if (websocket?.socket[type]) {
        // @ts-ignore
        websocket?.socket[type](ws, ...args);
      }
    };
  }

}
