import { Middleware } from '../../../server/decorators';
import { type Context, MiddlewareService } from '../../../adapter/hono';

@Middleware()
export class ExportedTopMiddlewareTest extends MiddlewareService {

  public handle(context: Context, next: Function): any {
    context.setValue('top', 'Test Value');
    next();
  }

}
