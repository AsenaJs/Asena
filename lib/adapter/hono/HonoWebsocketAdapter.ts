import {
  AsenaSocket,
  type AsenaWebSocketService,
  type WebSocketData,
  type WSEvents,
  type WSOptions,
} from '../../server/web/websocket';
import { AsenaWebsocketAdapter } from '../AsenaWebsocketAdapter';
import type { Context, Hono, HonoRequest, MiddlewareHandler } from 'hono';
import type { Server, ServerWebSocket } from 'bun';
import * as bun from 'bun';
import { AsenaWebSocketServer } from '../../server/web/websocket/AsenaWebSocketServer';
import type { WebsocketAdapterParams, WebsocketServiceRegistry } from '../types';
import { green, yellow } from '../../logger';
import type { BaseMiddleware } from '../../server/web/types';
import { middlewareParser } from './utils/middlewareParser';

// TODO: middleware system on weboscket needs to be updated
export class HonoWebsocketAdapter extends AsenaWebsocketAdapter<Hono, HonoRequest, Response> {

  private _server: Server;

  public constructor(params?: WebsocketAdapterParams<Hono>) {
    super(params);
  }

  public registerWebSocket(
    webSocketService: AsenaWebSocketService<any>,
    middlewares: BaseMiddleware<HonoRequest, Response>[],
  ): void {
    if (!webSocketService) {
      throw new Error('Websocket service is not provided');
    }

    if (this.websockets === undefined) {
      this.websockets = new Map<string, WebsocketServiceRegistry<HonoRequest, Response>>();
    }

    const namespace = webSocketService.namespace;

    if (!namespace) {
      throw new Error('Namespace is not provided');
    }

    this.logger.info(
      `${green('Successfully')} registered ${yellow('WEBSOCKET')} route for PATH: ${green(`/${webSocketService.namespace}`)} (${webSocketService.constructor.name})`,
    );

    this.websockets.set(namespace, { socket: webSocketService, middlewares });
  }

  public buildWebsocket(options?: WSOptions): void {
    if (!this.websocket || !this.websockets?.size) return;

    for (const [, websocket] of this.websockets) {
      this.upgradeWebSocket(websocket.socket, websocket.middlewares);
    }

    this.prepareWebSocket(options);
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

  private prepareWebSocket(options?: WSOptions): void {
    if (this.websockets?.size <= 1) {
      return;
    }

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

  private upgradeWebSocket(
    websocket: AsenaWebSocketService<any>,
    middlewares: BaseMiddleware<HonoRequest, Response>[],
  ): void {
    const path = websocket.namespace;

    const preparedMiddlewares = this.prepareMiddlewares(middlewares);

    this.app.get(`/${path}`, ...preparedMiddlewares, async (c: Context, next) => {
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

  private prepareMiddlewares(middlewares: BaseMiddleware<HonoRequest, Response>[]): MiddlewareHandler[] {
    return middlewareParser(middlewares);
  }

}
