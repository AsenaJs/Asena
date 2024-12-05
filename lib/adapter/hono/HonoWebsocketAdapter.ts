import {
  AsenaSocket,
  type AsenaWebSocketService,
  type WebSocketData,
  type WSEvents,
  type WSOptions,
} from '../../server/web/websocket';
import { AsenaWebsocketAdapter } from '../AsenaWebsocketAdapter';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { Server, ServerWebSocket } from 'bun';
import * as bun from 'bun';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { ComponentConstants } from '../../ioc/constants';
import { AsenaWebSocketServer } from '../../server/web/websocket/AsenaWebSocketServer';
import type { WebsocketAdapterParams, WebsocketServiceRegistry } from '../types';
import {green, yellow} from "../../logger";

export class HonoWebsocketAdapter extends AsenaWebsocketAdapter<Hono, MiddlewareHandler> {

  private _server: Server;

  public constructor(params?: WebsocketAdapterParams<Hono>) {
    super(params);
  }

  public registerWebSocket(webSocketService: AsenaWebSocketService<any>, middlewares: MiddlewareHandler[]): void {
    if (!webSocketService) {
      throw new Error('Websocket service is not provided');
    }

    if (this.websockets === undefined) {
      this.websockets = new Map<string, WebsocketServiceRegistry<MiddlewareHandler>>();
    }

    const namespace = getMetadata(ComponentConstants.PathKey, webSocketService.constructor);

    if (!namespace) {
      throw new Error('Namespace is not provided');
    }

    webSocketService.namespace = namespace;

    this.logger.info(
      `${green('Successfully')} registered ${yellow('WEBSOCKET')} route for PATH: ${green(`/${webSocketService.namespace}`)} (${webSocketService.constructor.name})`,
    );

    this.websockets.set(namespace, { socket: webSocketService, middlewares });
  }

  public prepareWebSocket(options?: WSOptions): void {
    this.websocket = {
      open: this.createHandler('onOpenInternal'),
      message: this.createHandler('onMessage'),
      drain: this.createHandler('onDrain'),
      close: this.createHandler('onCloseInternal'),
      ping: this.createHandler('onPing'),
      pong: this.createHandler('onPong'),
      ...options,
    };
  }

  public buildWebsocket(): void {
    if (!this.websocket || !this.websockets?.size) return;

    for (const [, websocket] of this.websockets) {
      this.upgradeWebSocket(websocket.socket, websocket.middlewares);
    }
  }

  public startWebsocket(server: Server) {
    this._server = server;

    if (!this.websockets) {
      return;
    }

    for (const [namespace, websocket] of this.websockets) {
      websocket.socket.server = new AsenaWebSocketServer(server, namespace);
    }
  }

  private upgradeWebSocket(websocket: AsenaWebSocketService<any>, middlewares: MiddlewareHandler[]): void {
    const path = websocket.namespace;

    this.app.get(`/${path}`, ...middlewares, async (c: Context, next) => {
      const websocketData = c.get('_websocketData') || {};

      const id = bun.randomUUIDv7();

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
      const websocket = this.websockets.get(ws.data.path);

      if (websocket?.socket[type]) {
        (websocket?.socket[type] as (...args: any[]) => void)(new AsenaSocket(ws, websocket.socket), ...args);
      }
    };
  }

}
