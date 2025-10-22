import { Middleware } from '../../../lib/server/decorators';
import { AsenaMiddlewareService } from '../../../lib/server/web/middleware';
import type { AsenaContext } from '../../../lib/adapter';

@Middleware()
export class ExportedTopMiddleware extends AsenaMiddlewareService {
  public handle(context: AsenaContext<any, any>, next: Function): any {
    context.setValue('top', 'Test Value');
    next();
  }
}
