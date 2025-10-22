import { Controller } from '../../../lib/server/decorators';
import { Inject } from '../../../lib/ioc/component';
import { ExportedTopMiddleware } from '../middleware/ExportedTopMiddleware.test';
import type { AsenaContext } from '../../../lib/adapter';
import { Delete, Get, Head, Options, Patch, Post, Put, Trace } from '../../../lib/server/web/decorators';
import type { ExportedTestService } from '../service/ExportedTestService.test';

@Controller({ path: '/test', name: 'ExportedTestController', middlewares: [ExportedTopMiddleware] })
export class ExportedTestController {
  @Inject('ExportedTestService')
  private testService: ExportedTestService;

  @Get('/data')
  public getData(context: AsenaContext<any, any>) {
    return context.send(this.testService.getValue());
  }

  @Post('/data')
  public async postData(context: AsenaContext<any, any>) {
    return context.send(this.testService.setValue(await context.getBody()));
  }

  @Put('/data')
  public async putData(context: AsenaContext<any, any>) {
    return context.send(this.testService.setValue(await context.getBody()));
  }

  @Trace('/data')
  public async traceData(context: AsenaContext<any, any>) {
    return context.send(this.testService.setValue(await context.getBody()));
  }

  @Patch('/data')
  public async patchData(context: AsenaContext<any, any>) {
    return context.send(this.testService.setValue(await context.getBody()));
  }

  @Delete('/data')
  public async deleteData(context: AsenaContext<any, any>) {
    return context.send(this.testService.deleteValue());
  }

  @Head('/data')
  public async headData(context: AsenaContext<any, any>) {
    return context.send('');
  }

  @Options('/data')
  public optionsData(context: AsenaContext<any, any>) {
    return context.send({
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE'],
    });
  }
}
