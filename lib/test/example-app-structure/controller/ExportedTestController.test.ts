import { Controller } from '../../../server/decorators';
import { Inject } from '../../../ioc/component/decorators';
import { ExportedTestServiceTest } from '../service/ExportedTestService.test';
import { ExportedTopMiddlewareTest } from '../middleware/ExportedTopMiddleware.test';
import { Get } from '../../../server/web/api';
import type { AsenaContext } from '../../../adapter';

@Controller({ path: '/test', name: 'ExportedTestController', middlewares: [ExportedTopMiddlewareTest] })
export class ExportedTestControllerTest {

  @Inject(ExportedTestServiceTest)
  private testService: ExportedTestServiceTest;

  @Get('/data')
  public getData(context: AsenaContext<any, any>) {
    return context.send(this.testService.getValue());
  }

}
