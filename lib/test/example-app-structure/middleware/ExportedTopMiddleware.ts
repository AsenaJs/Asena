import { Middleware } from '../../../server/decorators';
import { MiddlewareService } from '../../../server/web/middleware';
import type { Context } from '../../../adapter/defaultAdapter';

@Middleware()
export class ExportedTopMiddleware extends MiddlewareService {

  public handle(context: Context, next: Function): any {
    context.setValue('top', 'Test Value');
    next();
  }

}
