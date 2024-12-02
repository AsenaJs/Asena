import { Controller } from '../../../server/decorators';
import { Inject } from '../../../ioc/component';
import { ExportedTestServiceTest } from '../service/ExportedTestService.test';
import { ExportedTopMiddlewareTest } from '../middleware/ExportedTopMiddleware.test';
import type { AsenaContext } from '../../../adapter';
import { Get } from '../../../server/web/decorators';

@Controller({ path: '/test', name: 'ExportedTestController', middlewares: [ExportedTopMiddlewareTest] })
export class ExportedTestControllerTest {

  @Inject(ExportedTestServiceTest)
  private testService: ExportedTestServiceTest;

  @Get('/data')
  public getData(context: AsenaContext<any, any>) {
    return context.send(this.testService.getValue());
  }

}
