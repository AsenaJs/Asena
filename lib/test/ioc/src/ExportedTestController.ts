import { Component } from '../../../server/decorators';
import { Scope } from '../../../ioc/types';
import { Inject } from '../../../ioc/component/decorators';
import { ExportedTestService } from './ExportedTestService';

@Component({
  name: 'ExportedTestController',
  scope: Scope.SINGLETON,
})
export class ExportedTestController {

  @Inject(ExportedTestService)
  private testService: ExportedTestService;

  public getData(): string {
    return this.testService.getValue();
  }

}
