import { PrepareService } from '../PrepareService';
import { getOwnTypedMetadata } from '../../../utils/typedMetadata';
import { ComponentConstants } from '../../../ioc/constants';
import type { AsenaWebSocketService, WebSocketData } from '../../web/websocket';
import { ComponentType } from '../../../ioc/types';
import type { Container } from '../../../ioc';
import type { ServerLogger } from '../../../logger';

export class PrepareWebsocketService extends PrepareService {

  public constructor(container: Container, logger: ServerLogger) {
    super(container, logger);
  }

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
