import { Middleware } from '../../../server/decorators';
import { MiddlewareService } from '../../../server/web/middleware';
import type { Context } from '../../../adapter/defaultAdapter';

@Middleware()
export class ExportedWebsocketMiddlewareTest extends MiddlewareService {

  public handle(context: Context, next: Function): any {
    context.setWebSocketValue('websocketValue');
    next();
  }

}
