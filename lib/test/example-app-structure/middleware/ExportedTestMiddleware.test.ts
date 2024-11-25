import { Middleware } from '../../../server/decorators';
import { MiddlewareService } from '../../../server/web/middleware';
import type { Context } from '../../../adapter/defaultAdapter';

@Middleware()
export class ExportedTestMiddlewareTest extends MiddlewareService {

  public handle(context: Context, next: Function): any {
    context.setValue('test', 'Test Value');
    next();
  }

}
