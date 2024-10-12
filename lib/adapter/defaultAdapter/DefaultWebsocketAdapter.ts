import type { WebSocketData, WebSocketHandlerWithPath, WSEvents, WSOptions } from '../../server/web/websocket';
import { AsenaWebsocketAdapter } from '../AsenaWebsocketAdapter';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import * as crypto from 'node:crypto';

export class DefaultWebsocketAdapter extends AsenaWebsocketAdapter<Hono, MiddlewareHandler> {

  private _websocket: WebSocketHandler;

  private _server: Server;

  public constructor(app: Hono) {
    super();

    this.app = app;
  }

  public registerWebSocketHandler(websocketHandlers: WebSocketHandlerWithPath<MiddlewareHandler>): void {
    if (this.websocketHandlers === undefined) {
      this.websocketHandlers = [];
    }

    this.websocketHandlers.push(websocketHandlers);
  }

  public prepareWebSocket(options?: WSOptions): void {
    const createHandler =
      (type: keyof WSEvents) =>
      (ws: ServerWebSocket<WebSocketData>, ...args: any[]) => {
        const handler = this.websocketHandlers.find((h) => h.path === ws.data.path);

        if (handler?.[type]) {
          // @ts-ignore

          handler[type](ws, ...args);
        }
      };

    this._websocket = {
      open: createHandler('onOpen'),
      message: createHandler('onMessage'),
      drain: createHandler('onDrain'),
      close: createHandler('onClose'),
      ping: createHandler('onPing'),
      pong: createHandler('onPong'),
      ...options,
    };
  }

  public upgradeWebSocket(handler: WebSocketHandlerWithPath<MiddlewareHandler>): void {
    this.app.get(`/${handler.path}`, ...handler.middlewares, async (c: Context, next) => {
      const websocketData = c.get('_websocketData') || {};

      const id = crypto.randomUUID();

      const data: WebSocketData = { values: websocketData, id, path: handler.path };
      const upgradeResult = this._server.upgrade(c.req.raw, { data });

      if (upgradeResult) {
        return new Response(null);
      }

      await next(); // Failed
    });
  }

  public startWebSocket(): void {
    if (!this._websocket) return;

    for (const handler of this.websocketHandlers) {
      this.upgradeWebSocket(handler);
    }
  }

  public get websocket(): WebSocketHandler {
    return this._websocket;
  }

  // eslint-disable-next-line accessor-pairs
  public setServer(server: Server) {
    this._server = server;
  }

}
