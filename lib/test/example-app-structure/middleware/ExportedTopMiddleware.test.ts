import { Middleware } from '../../../server/decorators';
import { AsenaMiddlewareService } from '../../../server/web/middleware';
import type { AsenaContext } from '../../../adapter';

@Middleware()
export class ExportedTopMiddleware extends AsenaMiddlewareService {

  public handle(context: AsenaContext<any, any>, next: Function): any {
    context.setValue('top', 'Test Value');
    next();
  }

}
