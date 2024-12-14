import { Controller } from '../../../server/decorators';
import { Inject } from '../../../ioc/component';
import { ExportedTopMiddleware } from '../middleware/ExportedTopMiddleware.test';
import type { AsenaContext } from '../../../adapter';
import { Get } from '../../../server/web/decorators';
import { ExportedTestService } from '../service/ExportedTestService.test';

@Controller({ path: '/test', name: 'ExportedTestController', middlewares: [ExportedTopMiddleware] })
export class ExportedTestController {

  @Inject(ExportedTestService)
  private testService: ExportedTestService;

  @Get('/data')
  public getData(context: AsenaContext<any, any>) {
    return context.send(this.testService.getValue());
  }

}
