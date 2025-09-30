import type { ServerWebSocket, ServerWebSocketSendStatus, WebSocketReadyState } from 'bun';
import type { WebSocketData } from './types';
import type { AsenaWebSocketService } from './AsenaWebSocketService';

export class AsenaSocket<T> implements ServerWebSocket<WebSocketData<T>> {

  private ws: ServerWebSocket<WebSocketData<T>>;

  private _remoteAddress: string;

  private _readyState: WebSocketReadyState;

  private _binaryType?: 'nodebuffer' | 'arraybuffer' | 'uint8array';

  private _data: WebSocketData<T>;

  private _id: string;

  private _websocketService: AsenaWebSocketService<any>;

  public constructor(ws: ServerWebSocket<WebSocketData<T>>, websocketService: AsenaWebSocketService<any>) {
    this.ws = ws;
    this._data = ws.data;
    this._id = ws.data.id;
    this._remoteAddress = ws.remoteAddress;
    this._binaryType = ws.binaryType;
    this._readyState = ws.readyState;
    this._websocketService = websocketService;
  }

  public send(data: string | ArrayBufferLike | DataView, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.send(data, compress);
  }

  public sendText(data: string, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.sendText(data, compress);
  }

  public sendBinary(data: ArrayBufferLike | DataView, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.sendBinary(data, compress);
  }

  public close(code?: number, reason?: string): void {
    this.cleanup();
    this.ws.close(code, reason);
  }

  public terminate(): void {
    this.cleanup();
    this.ws.terminate();
  }

  public ping(data?: string | ArrayBufferLike | DataView): ServerWebSocketSendStatus {
    return this.ws.ping(data);
  }

  public pong(data?: string | ArrayBufferLike | DataView): ServerWebSocketSendStatus {
    return this.ws.pong(data);
  }

  public publish(
    topic: string,
    data: string | ArrayBufferLike | DataView,
    compress?: boolean,
  ): ServerWebSocketSendStatus {
    return this.ws.publish(this.createTopic(topic), data, compress);
  }

  public publishText(topic: string, data: string, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.publishText(this.createTopic(topic), data, compress);
  }

  public publishBinary(topic: string, data: ArrayBufferLike | DataView, compress?: boolean): ServerWebSocketSendStatus {
    return this.ws.publishBinary(this.createTopic(topic), data, compress);
  }

  public subscribe(topic: string): void {
    const room = this._websocketService.rooms.get(topic);

    if (room) {
      room.push(this);
    } else {
      this._websocketService.rooms.set(topic, [this]);
    }

    this.ws.subscribe(this.createTopic(topic));
  }

  public unsubscribe(topic: string): void {
    const room = this._websocketService.rooms.get(topic);

    if (room) {
      // Filter out this socket instead of splice for better safety
      const filteredRoom = room.filter((s) => s.id !== this.id);

      if (filteredRoom.length === 0) {
        this._websocketService.rooms.delete(topic);
      } else if (filteredRoom.length !== room.length) {
        // Only update if we actually removed something
        this._websocketService.rooms.set(topic, filteredRoom);
      }
    }

    this.ws.unsubscribe(this.createTopic(topic));
  }

  public cleanup(): void {
    // Create a snapshot of topics to avoid modification during iteration
    const topics = Array.from(this._websocketService.rooms.keys());
    for (const topic of topics) {
      this.unsubscribe(topic);
    }
  }

  public isSubscribed(topic: string): boolean {
    return this.ws.isSubscribed(this.createTopic(topic));
  }

  public cork<T = unknown>(callback: (ws: ServerWebSocket<T>) => T): T {
    return this.ws.cork(callback);
  }

  public get remoteAddress(): string {
    return this._remoteAddress;
  }

  public set remoteAddress(value: string) {
    this._remoteAddress = value;
  }

  public get binaryType(): 'nodebuffer' | 'arraybuffer' | 'uint8array' {
    return this._binaryType;
  }

  public set binaryType(value: 'nodebuffer' | 'arraybuffer' | 'uint8array') {
    this._binaryType = value;
  }

  public get readyState(): WebSocketReadyState {
    return this._readyState;
  }

  public set readyState(value: WebSocketReadyState) {
    this._readyState = value;
  }

  public get data(): WebSocketData<T> {
    return this._data;
  }

  public set data(value: WebSocketData<T>) {
    this._data = value;
  }

  public get namespace(): string {
    return this._websocketService.namespace;
  }

  public get id(): string {
    return this._id;
  }

  public set id(value: string) {
    this._id = value;
  }

  public getBufferedAmount(): number {
    return this.ws.getBufferedAmount();
  }

  private createTopic(topic: string): string {
    return `${this.namespace}.${topic}`;
  }

}

export type Socket<T = any> = AsenaSocket<T>;
