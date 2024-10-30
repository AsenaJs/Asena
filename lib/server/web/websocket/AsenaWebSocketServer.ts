import type { Server } from 'bun';

export class AsenaWebSocketServer {

  private server: Server;

  private readonly topic: string;

  public constructor(server: Server, topic: string) {
    this.server = server;

    this.topic = topic;
  }

  public to(nameSpace: string, data?: any) {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof SharedArrayBuffer) {
      this.server.publish(nameSpace, data);

      return;
    }

    if ((typeof data === 'object' || typeof data === 'string') && data !== null) {
      this.server.publish(nameSpace, JSON.stringify(data));
    } else if (typeof data === 'number' || data === null || data === undefined) {
      this.server.publish(nameSpace, String(data));
    }
  }

  public in(nameSpace: string, data?: any) {
    this.to(nameSpace, data);
  }

  public get websocketCount() {
    return this.server.subscriberCount(this.topic);
  }

}
