import { getOwnTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { AsenaWebSocketService, WebSocketData } from '../../web/websocket';
import { ComponentType } from '../../../ioc';
import type { Container, ICoreService } from '../../../ioc';
import type { ServerLogger } from '../../../logger';
import { CoreService } from '../../../ioc';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing WebSocket services
 * Handles WebSocket resolution and path registration
 */
@CoreService('PrepareWebsocketService')
export class PrepareWebsocketService implements ICoreService {

  public serviceName = 'PrepareWebsocketService';

  @Inject('Container')
  private container: Container;

  @Inject('ServerLogger')
  private logger: ServerLogger;

  public async prepare(): Promise<AsenaWebSocketService<WebSocketData<any>>[]> {
    const webSockets = await this.container.resolveAll<AsenaWebSocketService<WebSocketData>>(ComponentType.WEBSOCKET);

    if (!webSockets?.length) {
      this.logger.info('No websockets found');
      return;
    }

    // flat the array
    const flatWebSockets = webSockets.flat();
    const registeredPaths = new Set<string>();

    const preparedWebsockets: AsenaWebSocketService<WebSocketData<any>>[] = [];

    for (const webSocket of flatWebSockets) {
      const path = getOwnTypedMetadata<string>(ComponentConstants.PathKey, webSocket.constructor);

      if (registeredPaths.has(path)) {
        throw new Error(`Duplicate WebSocket path found: ${path}`);
      }

      registeredPaths.add(path);
      webSocket.namespace = path;

      preparedWebsockets.push(webSocket);
    }

    return preparedWebsockets;
  }

}
