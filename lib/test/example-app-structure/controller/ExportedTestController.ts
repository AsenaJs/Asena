import { Controller } from '../../../server/decorators';
import { Inject } from '../../../ioc/component/decorators';
import { ExportedTestService } from '../service/ExportedTestService';
import { ExportedTopMiddleware } from '../middleware/ExportedTopMiddleware';
import { Get } from '../../../server/web/api';
import type { AsenaContext } from '../../../adapter';

@Controller({ path: '/test', name: 'ExportedTestController', middlewares: [ExportedTopMiddleware] })
export class ExportedTestController {

  @Inject(ExportedTestService)
  private testService: ExportedTestService;

  @Get('/data')
  public getData(context: AsenaContext<any, any>) {
    return context.send(this.testService.getValue());
  }

}
