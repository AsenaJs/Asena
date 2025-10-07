import { Middleware } from '../../../server/decorators';
import { AsenaMiddlewareService } from '../../../server/web/middleware';
import type { AsenaContext } from '../../../adapter';

@Middleware()
export class ExportedTestMiddleware extends AsenaMiddlewareService {

  public handle(context: AsenaContext<any, any>, next: Function): any {
    context.setValue('test', 'Test Value');
    next();
  }

}
