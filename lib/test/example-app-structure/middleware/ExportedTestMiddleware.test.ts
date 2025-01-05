import { Middleware } from '../../../server/decorators';
import type { Context } from '../../../adapter/hono';
import { MiddlewareService } from '../../../adapter/hono';

@Middleware()
export class ExportedTestMiddleware extends MiddlewareService {

  public handle(context: Context, next: Function): any {
    context.setValue('test', 'Test Value');
    next();
  }

}
