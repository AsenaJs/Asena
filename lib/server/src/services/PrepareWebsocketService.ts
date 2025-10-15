import { getOwnTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc';
import type { AsenaWebSocketService, WebSocketData } from '../../web/websocket';
import type { Container, ICoreService } from '../../../ioc';
import { ComponentType, CoreService, ICoreServiceNames } from '../../../ioc';
import { Inject } from '../../../ioc/component';

/**
 * @description Core service for preparing WebSocket services
 * Handles WebSocket resolution and path registration
 */
@CoreService(ICoreServiceNames.PREPARE_WEBSOCKET_SERVICE)
export class PrepareWebsocketService implements ICoreService {

  public serviceName = 'PrepareWebsocketService';

  @Inject(ICoreServiceNames.CONTAINER)
  private container: Container;

  public async prepare(): Promise<AsenaWebSocketService<WebSocketData<any>>[]> {
    const webSockets = await this.container.resolveAll<AsenaWebSocketService<WebSocketData>>(ComponentType.WEBSOCKET);

    if (!webSockets?.length) {
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
